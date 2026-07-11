import { Link } from 'react-router-dom';

// Content sourced from https://docs.omnidim.io/docs/dashboard-guides/configure-your-agent
// and https://docs.omnidim.io/docs/dashboard-guides/voices-and-languages

const TipCard = ({ icon, text }: { icon: string; text: string }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '3px solid var(--teal)', borderRadius: 'var(--radius-sm)', padding: '13px 16px' }}>
    <span style={{ color: 'var(--teal)', fontSize: 16, flexShrink: 0 }}>{icon}</span>
    <span style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{text}</span>
  </div>
);

const StepBadge = ({ n }: { n: number }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: 'var(--teal-light)', border: '1px solid var(--teal)', color: 'var(--teal)', fontWeight: 800, fontSize: 12, flexShrink: 0, marginRight: 12 }}>{n}</span>
);

export default function AgentDoc() {
  return (
    <>
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="breadcrumb">
          <Link to="/">Home</Link><span>›</span>
          <Link to="/documentation">Documentation</Link><span>›</span>
          <span style={{ color: 'var(--text-primary)' }}>Configure your agent</span>
        </div>
      </div>

      <div className="doc-hero" style={{ paddingBottom: 40 }}>
        <div className="badge" style={{ margin: '0 auto 16px' }}>💬 Build Your Agent</div>
        <h1 style={{ fontSize: 36, marginBottom: 14 }}>Configure your agent</h1>
        <p className="subtitle" style={{ maxWidth: 580, margin: '0 auto 24px' }}>
          Configure the conversational flow for your agent — sections, instructions, welcome message, and best practices.
        </p>
        <div className="doc-actions">
          <Link to="/dashboard" className="btn btn-primary btn-lg">Create Agent →</Link>
          <Link to="/docs/getting-started" className="btn btn-secondary btn-lg">← Quickstart</Link>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: 80 }}>

        {/* What is Conversational Flow */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Conversational Flow</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>
            The Conversational Flow section lets you create structured instructions that define how your agent handles different parts of a conversation and what actions it should take.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
            {[
              { icon: '🗺️', title: 'Complex scenarios', desc: 'Guide your agent through multi-step conversation flows.' },
              { icon: '📋', title: 'Consistent handling', desc: 'Ensure specific topics are always handled the same way.' },
              { icon: '🔄', title: 'Logical flow', desc: 'Create a clear sequence for multi-step processes.' },
              { icon: '⚙️', title: 'Specialized tasks', desc: 'Provide detailed instructions for any task type.' },
            ].map(f => (
              <div key={f.title} className="doc-card animate-me">
                <div className="doc-card-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section Management */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>Setup guide</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              {
                n: 1,
                title: 'Section management',
                desc: 'Manage different stages of the conversation by creating, reordering, or removing instruction sections.',
                bullets: [
                  'Add sections — create new instruction blocks for different conversation stages',
                  'Reorder sections — drag and drop to change the sequence',
                  'Remove sections — delete unnecessary instruction blocks',
                ],
              },
              {
                n: 2,
                title: 'Section configuration',
                desc: 'Customize the content and behavior of each section in the conversational flow.',
                bullets: [
                  'Section title — a descriptive name for this conversation stage',
                  'Instructions — detailed guidance for how the agent handles this part of the conversation',
                ],
              },
              {
                n: 3,
                title: 'Welcome message',
                desc: 'Add or edit the welcome message from the conversation flow section. The welcome message is currently static.',
                bullets: [],
              },
              {
                n: 4,
                title: 'Plan your conversation structure',
                desc: 'Before adding sections, outline the key stages of your ideal conversation.',
                bullets: ['Introduction', 'Information gathering', 'Problem solving', 'Conclusion'],
              },
              {
                n: 5,
                title: 'Create sections for each stage',
                desc: 'Add a section for each conversation stage with clear, descriptive titles and detailed instructions.',
                bullets: [],
              },
              {
                n: 6,
                title: 'Provide detailed instructions',
                desc: 'In each section, include what information to collect, how to respond to specific questions, and when to move on.',
                bullets: [
                  'What information to collect',
                  'How to respond to specific questions',
                  'When to move to the next stage',
                  'Any actions to take (e.g., scheduling or data collection)',
                ],
              },
              {
                n: 7,
                title: 'Test and refine',
                desc: 'After setting up your flow, test conversations to ensure the agent follows instructions. Refine sections based on user interactions and add new ones as needed.',
                bullets: [],
              },
            ].map((step, i, arr) => (
              <div key={step.n} style={{ display: 'flex', gap: 0, position: 'relative' }}>
                {/* vertical line */}
                {i < arr.length - 1 && (
                  <div style={{ position: 'absolute', left: 12, top: 38, bottom: -8, width: 2, background: 'var(--border)', zIndex: 0 }} />
                )}
                <div style={{ display: 'flex', gap: 18, paddingBottom: 28, zIndex: 1, width: '100%' }}>
                  <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: 'var(--teal-light)', border: '1px solid var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', fontWeight: 800, fontSize: 12, marginTop: 2 }}>{step.n}</div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>{step.title}</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.6 }}>{step.desc}</p>
                    {step.bullets.length > 0 && (
                      <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {step.bullets.map(b => (
                          <li key={b} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Voices & Languages */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Voices & Languages</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>
            OmniDimension supports 1000+ voices across 90+ languages — from native-fluency regional accents to multilingual personas.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {[
              { num: '1000+', label: 'Voices' },
              { num: '90+', label: 'Languages' },
              { num: 'Custom', label: 'Voice Cloning' },
              { num: 'Real-time', label: 'TTS' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)', marginBottom: 4 }}>{s.num}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Best Practices */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Best practices</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <TipCard icon="✓" text="Write instructions in clear, direct language." />
            <TipCard icon="✓" text="Include example responses for complex scenarios." />
            <TipCard icon="✓" text="Specify exactly what information to collect in each section." />
            <TipCard icon="✓" text="Provide fallback instructions for unexpected situations." />
            <TipCard icon="✓" text="Keep sections focused on specific conversation stages." />
          </div>
        </section>

        {/* Pro Tips */}
        <section style={{ marginBottom: 60 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Pro tips</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <TipCard icon="💡" text="Start with fewer sections and add more as needed." />
            <TipCard icon="💡" text="Use drag-and-drop to optimize conversation flow." />
            <TipCard icon="💡" text="Review conversation recordings to identify areas for improvement." />
            <TipCard icon="💡" text="Update your flow regularly based on common user interactions." />
          </div>
        </section>

        <div className="cta-box animate-me">
          <div className="badge" style={{ margin: '0 auto 20px' }}>Build Now</div>
          <h2>Create your first AI agent</h2>
          <p>Head to the dashboard to build, test, and deploy a voice agent in minutes.</p>
          <Link to="/dashboard" className="btn btn-primary btn-lg">Open Dashboard →</Link>
        </div>
      </div>
    </>
  );
}
