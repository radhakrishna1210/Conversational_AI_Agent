import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { MessageSquare, Cpu, CheckCircle2, User, Bot, Smile, Frown, Meh } from 'lucide-react';

export default function UserCallsLogs() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Monitoring & Insights</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Conversation Analysis & Variable Extraction</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Analyze turn-by-turn conversation transcripts, sentiment ratings, and AI-extracted structured variables for deep call intelligence.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Post-Call Intelligence & Extraction Lifecycle"
        description="How spoken dialogue is parsed into structured business intelligence after call completion."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Transcript Generation',
            description: 'Speech recognition creates synchronized turns for User and Assistant.',
            icon: <MessageSquare size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'Sentiment Analysis',
            description: 'LLM evaluates customer emotional tone (Positive, Neutral, Negative).',
            icon: <Smile size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Entity Extraction',
            description: 'Extracts configured business variables (names, dates, amounts, commitments).',
            icon: <Cpu size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'Workflow Dispatch',
            description: 'Structured JSON payload is stored in DB and dispatched to connected CRMs.',
            icon: <CheckCircle2 size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Synchronized Turn-by-Turn Transcripts</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        When inspecting any call log in Spandan, the transcript view provides an exact chronological representation of the conversation:
      </p>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(14,179,158,0.15)', color: 'var(--teal-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
            <Bot size={14} />
          </span>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--teal-fg)', fontWeight: 600, marginBottom: '4px' }}>Assistant · 00:02</div>
            <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              Hello! This is Priya from Apex Healthcare calling to confirm your appointment with Dr. Sharma tomorrow at 3:00 PM. Are you still able to make it?
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(129,140,248,0.15)', color: 'var(--violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
            <User size={14} />
          </span>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--violet)', fontWeight: 600, marginBottom: '4px' }}>User · 00:09</div>
            <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              Hi Priya, yes I will be there on time. Could you please send me the clinic directions on WhatsApp?
            </div>
          </div>
        </div>
      </div>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Sentiment Analysis Scoring</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Spandan automatically scores caller sentiment at the conclusion of every dialogue:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--lime)', fontWeight: 700, marginBottom: '6px' }}>
            <Smile size={18} />
            <span>Positive</span>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
            Customer was receptive, confirmed appointments, expressed interest, or agreed to terms.
          </p>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
            <Meh size={18} />
            <span>Neutral</span>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
            Standard informational exchange without strong positive or negative emotional signals.
          </p>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--err)', fontWeight: 700, marginBottom: '6px' }}>
            <Frown size={18} />
            <span>Negative</span>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
            Customer expressed frustration, requested immediate opt-out, or disputed an invoice.
          </p>
        </div>
      </div>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3. Extracted JSON Variables Inspection</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        In the call detail pane, the <strong>Extracted Information</strong> section renders structured key-value entities parsed by the post-call intelligence model:
      </p>

      <DocsScreenshotPlaceholder
        title="Extracted Information Panel"
        description="Structured JSON output showing extracted user intent, confirmed appointment slots, lead scores, and model reasoning metadata."
        routePath="/call_logs"
        elements={[
          { label: 'user_name', value: 'Rahul Sharma', type: 'badge' },
          { label: 'appointment_confirmed', value: 'true', type: 'badge' },
          { label: 'appointment_time', value: 'Tomorrow at 3:00 PM', type: 'badge' },
          { label: 'whatsapp_opt_in', value: 'true', type: 'badge' },
          { label: 'Extraction Status', value: 'COMPLETED', type: 'text' }
        ]}
      />

      <DocsCallout type="tip" title="CRM AUTOMATION SYNC">
        Extracted variables are automatically included in outgoing webhooks to Salesforce, HubSpot, GoHighLevel, and Zapier, allowing you to update CRM records without writing custom parsing code.
      </DocsCallout>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/call-logs" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Call Logs & Audio Waveforms
        </Link>
        <Link to="/docs/user/analytics" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Analytics & Margin Tracking →
        </Link>
      </div>
    </div>
  );
}
