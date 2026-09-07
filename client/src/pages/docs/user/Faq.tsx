import { Link } from 'react-router-dom';

interface FaqItemProps {
  question: string;
  answer: React.ReactNode;
}

function FaqItem({ question, answer }: FaqItemProps) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '18px',
      marginBottom: '16px'
    }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
        {question}
      </h3>
      <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {answer}
      </div>
    </div>
  );
}

export default function UserFaq() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Reference & Help</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Frequently Asked Questions & Glossary</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Quick answers to common operational questions, billing explanations, regulatory compliance rules, and an authoritative glossary of Spandan terminology.
      </p>

      {/* FAQs Section */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 20 }}>Frequently Asked Questions</h2>

      <FaqItem
        question="What languages and regional accents does Spandan support?"
        answer="Spandan supports 18+ global languages and regional dialects, including English (Indian, American, British, Australian), Hindi, Bengali, Gujarati, Tamil, Spanish, French, German, Mandarin, Japanese, Korean, Portuguese, Russian, Arabic, and Italian."
      />

      <FaqItem
        question="How does Spandan bill for phone calls?"
        answer="Billing is strictly based on actual connected conversation talk-time in Indian Rupees (INR) drawn from your workspace prepaid wallet. Unanswered, failed, or busy calls incur zero charge."
      />

      <FaqItem
        question="Can callers interrupt the AI agent while it is speaking?"
        answer="Yes. When 'Interruptible' is enabled in call configuration, Voice Activity Detection (VAD) immediately stops agent speech the instant the human caller starts speaking, delivering natural conversational flow."
      />

      <FaqItem
        question="What is the difference between Bulk Call and Voice Broadcast?"
        answer="Bulk Call conducts full two-way interactive conversations using an AI agent (listening, reasoning, querying knowledge, and booking appointments). Voice Broadcast plays a fixed one-way audio recording or synthesized announcement and hangs up."
      />

      <FaqItem
        question="What is a Contact Cluster?"
        answer="A Contact Cluster is a named, deduplicated audience segment in your address book. When you upload a CSV file, it is converted into a cluster so you can re-dial or broadcast to the same group repeatedly without re-uploading spreadsheets."
      />

      <FaqItem
        question="Why is DLT compliance required for Indian (+91) phone numbers?"
        answer="The Telecom Regulatory Authority of India (TRAI) mandates that all commercial outbound telecommunications must be registered under an approved Principal Entity (PE ID) with bound Telemarketers and approved voice header templates to protect consumers against unregistered spam."
      />

      {/* Product Glossary */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 44, marginBottom: 20 }}>Product Glossary</h2>

      <div style={{ overflowX: 'auto', marginBottom: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600, width: '22%' }}>Term</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Definition & Technical Context</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>RAG (Retrieval-Augmented Generation)</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>A technique where relevant excerpts from your uploaded files are dynamically retrieved and injected into the LLM context during a call to ground answers in verified business facts.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>VAD (Voice Activity Detection)</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Real-time audio signal processing that detects when a human has started or stopped speaking, managing the speechgate boundary for natural turn-taking.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>E.164 Format</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>The international telecommunication numbering standard (+[country code][number], e.g. +919876543210). Required for all contacts in Spandan.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Contact Cluster</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>A persistent, named list of contacts representing a targeted audience segment for campaigns and broadcasts.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Principal Entity (PE ID)</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>A 19-digit unique legal entity registration issued by Indian telecom operators on their DLT portals.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Caller ID Pool Rotation</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>The automatic cycling of outbound telephone numbers across a campaign's calls to distribute volume and prevent carrier spam flagging.</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Wallet Runway</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>The estimated remaining talk-time minutes available in your workspace prepaid wallet at current platform rates.</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/troubleshooting" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Troubleshooting Guide
        </Link>
        <Link to="/docs" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Documentation Home →
        </Link>
      </div>
    </div>
  );
}
