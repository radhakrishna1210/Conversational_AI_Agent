import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { MessageCircle, QrCode, Cloud, Smartphone, Zap, CheckCircle2 } from 'lucide-react';

export default function UserWhatsApp() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Channels & Chat</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>WhatsApp Omnichannel Integration</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Extend your Voice AI assistants into WhatsApp chat using phone QR code pairing or the Meta Cloud API for unified voice-and-chat customer conversations.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Omnichannel Voice + WhatsApp Lifecycle"
        description="How conversational intelligence is unified across phone calls and WhatsApp text messaging."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Select Connection',
            description: 'Choose between Phone QR Pairing or Meta Cloud API integration.',
            icon: <MessageCircle size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'Pair Account',
            description: 'Scan QR code from business phone or configure Meta Cloud access tokens.',
            icon: <QrCode size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Shared Intelligence',
            description: 'Your Voice AI agent handles incoming and outgoing chats with the same RAG knowledge.',
            icon: <Zap size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'Post-Call Follow-ups',
            description: 'Automatically dispatch WhatsApp summaries and booking links when phone calls end.',
            icon: <CheckCircle2 size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Two Ways to Connect WhatsApp</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        The <strong>WhatsApp</strong> hub (<code style={{ color: 'var(--teal-fg)' }}>/whatsapp</code>) offers two distinct integration architectures:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '18px', marginBottom: '28px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--lime)', fontWeight: 700, marginBottom: '10px' }}>
            <Smartphone size={18} />
            <span>Phone WhatsApp (QR Pairing)</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
            Pair with an existing WhatsApp number by scanning a QR code with the WhatsApp mobile app on your phone.
          </p>
          <ul style={{ fontSize: '12.5px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li>Fastest setup — no Meta Developer account required.</li>
            <li>Uses your existing familiar phone number.</li>
            <li>Best for pilot testing and small to medium teams.</li>
            <li>Requires the mobile handset to maintain active internet connectivity.</li>
          </ul>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--violet)', fontWeight: 700, marginBottom: '10px' }}>
            <Cloud size={18} />
            <span>Cloud WhatsApp (Meta Cloud API)</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
            Direct integration with the official Meta Business Cloud API without any physical handset in the loop.
          </p>
          <ul style={{ fontSize: '12.5px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li>High throughput — handles thousands of simultaneous messages.</li>
            <li>Supports official Meta-approved Template Broadcasts.</li>
            <li>No handset dependencies — 99.99% server-side uptime.</li>
            <li>Recommended for production enterprise operations.</li>
          </ul>
        </div>
      </div>

      <DocsImage
        src="/screenshots/Whatsapp.png"
        alt="WhatsApp Omnichannel Dashboard"
        caption="WhatsApp connection manager: configure Phone QR pairing or Meta Cloud API access"
      />

      <DocsScreenshotPlaceholder
        title="WhatsApp Integration Selection"
        description="Choose between Phone WhatsApp QR Pairing or Cloud WhatsApp via Meta API, with shared agent intelligence notes."
        routePath="/whatsapp"
        elements={[
          { label: 'Phone WhatsApp', value: 'Scan QR from existing mobile handset', type: 'button' },
          { label: 'Cloud WhatsApp', value: 'Connect Meta Business Cloud API', type: 'button' },
          { label: 'Shared Brain', value: 'Same prompt, knowledge base, and tools as voice', type: 'badge' }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Shared Intelligence Across Voice and Chat</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        In Spandan, you never need to configure a separate chatbot and voice bot. The agent's system prompt, knowledge base documents, and tool integrations are completely omnichannel:
      </p>

      <DocsCallout type="note" title="UNIFIED AGENT BRAIN">
        When a customer interacts with your agent over WhatsApp, the agent retrieves context from the exact same Knowledge Base PDFs and executes the same calendar booking tools as it does on a phone call.
      </DocsCallout>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3. Automated Post-Call WhatsApp Follow-Ups</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        One of Spandan's most powerful workflows is combining Voice Calls with instant WhatsApp follow-up messages:
      </p>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Voice AI completes an outbound qualification call or appointment booking.</li>
        <li>Post-call automation checks if the customer agreed to receive WhatsApp details.</li>
        <li>Spandan automatically sends an instant WhatsApp message containing:
          <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
            <li>Confirmed appointment calendar link & directions</li>
            <li>Quotation PDF or product brochure</li>
            <li>Payment link or invoice summary</li>
          </ul>
        </li>
      </ol>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/analytics" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Analytics & Cost Tracking
        </Link>
        <Link to="/docs/user/integrations" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Integrations Ecosystem →
        </Link>
      </div>
    </div>
  );
}
