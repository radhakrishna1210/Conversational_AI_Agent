import { Link } from 'react-router-dom';

// Content sourced from https://docs.omnidim.io/docs/dashboard-guides/knowledge-base

import knowledgeBaseSetupOption1 from '../screenshots/knowledge-base-setup-option-1.png';
import knowledgeBaseSetupOption2 from '../screenshots/knowledge-base-setup-option-2.png';
import knowledgeBaseUploadFiles from '../screenshots/knowledge-base-upload-files.png';

const TipCard = ({ icon, text }: { icon: string; text: string }) => (
  <div style={{ display: 'flex', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '3px solid var(--teal)', borderRadius: 'var(--radius-sm)', padding: '12px 16px' }}>
    <span style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{icon}</span>
    <span style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{text}</span>
  </div>
);

const StepScreenshot = ({ src, alt, caption }: { src: string; alt: string; caption: string }) => (
  <div style={{ margin: '4px 20px 18px 36px' }}>
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: 'var(--bg-elevated)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
        maxWidth: 640,
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
        }}
      />
    </div>
    <p
      style={{
        marginTop: 8,
        fontSize: 12,
        color: 'var(--text-secondary)',
        fontStyle: 'italic',
      }}
    >
      {caption}
    </p>
  </div>
);

export default function KnowledgeBaseDoc() {
  return (
    <>
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="breadcrumb">
          <Link to="/">Home</Link><span>›</span>
          <Link to="/documentation">Documentation</Link><span>›</span>
          <span style={{ color: 'var(--text-primary)' }}>Knowledge Base</span>
        </div>
      </div>

      <div className="doc-hero" style={{ paddingBottom: 40 }}>
        <div className="badge" style={{ margin: '0 auto 16px' }}>🗄️ Knowledge Base</div>
        <h1 style={{ fontSize: 36, marginBottom: 14 }}>Knowledge Base</h1>
        <p className="subtitle" style={{ maxWidth: 580, margin: '0 auto 24px' }}>
          Provide your agent with domain-specific knowledge using document-based references. Ground responses in your own documents and policies.
        </p>
        <div className="doc-actions">
          <Link to="/files" className="btn btn-primary btn-lg">Manage Files →</Link>
          <Link to="/docs/agent" className="btn btn-secondary btn-lg">← Agent Config</Link>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: 80 }}>

        {/* What it does */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>What the Knowledge Base does</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>
            Knowledge Base allows your agent to access and utilise external documents and files, enabling it to reference specific information during live conversations.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
            {[
              { icon: '📚', title: 'Domain knowledge', desc: 'Provide your agent with company- or product-specific knowledge.' },
              { icon: '📎', title: 'Document upload', desc: 'Upload files for reference during conversations with users.' },
              { icon: '✅', title: 'Accurate answers', desc: 'Ensure consistent, accurate information delivery at scale.' },
              { icon: '🔄', title: 'Easy updates', desc: 'Reduce the need for manual information updates — just re-upload.' },
            ].map(f => (
              <div key={f.title} className="doc-card animate-me">
                <div className="doc-card-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Setup Option 1 */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>Setup guide</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Option 1 */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: '50%', background: 'var(--teal-light)', border: '1px solid var(--teal)', color: 'var(--teal)', fontWeight: 800, fontSize: 12, alignItems: 'center', justifyContent: 'center' }}>1</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Setup option 1 — From agent configuration</h3>
              </div>
              <ul style={{ margin: 0, padding: '16px 20px 16px 36px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  'Go to your agent\'s edit page from the Dashboard.',
                  'Select the Knowledge Base tab.',
                  'Upload files or select from your existing library.',
                  'Files will be automatically processed and made available to your agent.',
                ].map(step => (
                  <li key={step} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step}</li>
                ))}
              </ul>
              <StepScreenshot
                src={knowledgeBaseSetupOption1}
                alt="Knowledge Base tab in agent configuration"
                caption="The Knowledge Base tab inside the agent's edit page."
              />
            </div>

            {/* Option 2 */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: '50%', background: 'var(--teal-light)', border: '1px solid var(--teal)', color: 'var(--teal)', fontWeight: 800, fontSize: 12, alignItems: 'center', justifyContent: 'center' }}>2</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Setup option 2 — From the main dashboard</h3>
              </div>
              <ul style={{ margin: 0, padding: '16px 20px 16px 36px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  'Go to the Files page in your dashboard.',
                  'Upload files or select from your existing library.',
                  'Go to your agent\'s edit page.',
                  'Select the Knowledge Base tab.',
                  'Attach the uploaded files to the agent.',
                ].map(step => (
                  <li key={step} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step}</li>
                ))}
              </ul>
              <StepScreenshot
                src={knowledgeBaseSetupOption2}
                alt="Files page in the main dashboard"
                caption="Uploading and attaching files from the main Files dashboard."
              />
            </div>

            {/* Upload guide */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: '50%', background: 'var(--teal-light)', border: '1px solid var(--teal)', color: 'var(--teal)', fontWeight: 800, fontSize: 12, alignItems: 'center', justifyContent: 'center' }}>3</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Uploading files</h3>
              </div>
              <ul style={{ margin: 0, padding: '16px 20px 16px 36px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  'Click the Upload File button in the Knowledge Base section.',
                  'Select documents from your computer (supported format: PDF).',
                  'Wait for processing to complete.',
                  'Newly uploaded files will appear in your file library.',
                ].map(step => (
                  <li key={step} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step}</li>
                ))}
              </ul>
              <StepScreenshot
                src={knowledgeBaseUploadFiles}
                alt="Upload File button and file processing"
                caption="Uploading a PDF and watching it process into your file library."
              />
            </div>

            {/* Using with agent */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: '50%', background: 'var(--teal-light)', border: '1px solid var(--teal)', color: 'var(--teal)', fontWeight: 800, fontSize: 12, alignItems: 'center', justifyContent: 'center' }}>4</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Using with your agent</h3>
              </div>
              <ul style={{ margin: 0, padding: '16px 20px 16px 36px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  'The agent automatically references these documents when answering user queries.',
                  'Information from files is used to provide accurate and relevant responses.',
                  'The agent cites specific documents when providing information from them.',
                ].map(step => (
                  <li key={step} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Supported formats */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Supported file formats</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>Currently supported: PDF. More formats coming soon.</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--teal)', borderRadius: 'var(--radius-md)', padding: '14px 20px' }}>
            <span style={{ fontSize: 28 }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--teal)', fontSize: 16, fontFamily: 'monospace' }}>.PDF</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Documents, manuals, policies, FAQs</div>
            </div>
          </div>
        </section>

        {/* Pro tips */}
        <section style={{ marginBottom: 60 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Pro tips</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <TipCard icon="💡" text="Upload comprehensive documentation for best results." />
            <TipCard icon="💡" text="Use descriptive filenames to easily identify content in the library." />
            <TipCard icon="💡" text="Organise information in clear, structured documents for better retrieval." />
            <TipCard icon="💡" text="Regularly update your knowledge base with the latest information." />
            <TipCard icon="💡" text="Attach only relevant files to each agent to maintain focus and accuracy." />
          </div>
        </section>

        

        {/* Video tutorial note */}
        <section style={{ marginBottom: 60 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 32 }}>▶️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14, marginBottom: 4 }}>Video tutorial: Adding Knowledge Base</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
                Watch the guide on how to add and manage knowledge base documents for your agent.
              </p>
              <a
                href="https://www.youtube.com/watch?v=7FJoWB4UqRg"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', fontSize: 13 }}
              >
                Watch on YouTube ↗
              </a>
            </div>
          </div>
        </section>

        <div className="cta-box animate-me">
          <div className="badge" style={{ margin: '0 auto 20px' }}>Upload Now</div>
          <h2>Ground your agents with real knowledge</h2>
          <p>Upload your product docs, FAQs, and company knowledge from the Files dashboard.</p>
          <Link to="/files" className="btn btn-primary btn-lg">Open Files Dashboard →</Link>
        </div>
      </div>
    </>
  );
}
