import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw, PhoneCall, Mic, DollarSign, FileText } from 'lucide-react';

interface TroubleItemProps {
  title: string;
  symptom: string;
  cause: string;
  solution: string;
  icon: React.ReactNode;
}

function TroubleItem({ title, symptom, cause, solution, icon }: TroubleItemProps) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '20px',
      marginBottom: '20px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--teal)', fontWeight: 700, fontSize: '15px', marginBottom: '12px' }}>
        {icon}
        <span>{title}</span>
      </div>

      <div style={{ fontSize: '13px', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>What you see: </strong>
          <span style={{ color: 'var(--text-secondary)' }}>{symptom}</span>
        </div>
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>Likely cause: </strong>
          <span style={{ color: 'var(--text-secondary)' }}>{cause}</span>
        </div>
        <div style={{ marginTop: '4px', background: 'var(--bg-primary)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <strong style={{ color: 'var(--lime)' }}>How to resolve: </strong>
          <span style={{ color: 'var(--text-secondary)' }}>{solution}</span>
        </div>
      </div>
    </div>
  );
}

export default function UserTroubleshooting() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Help & Support</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Troubleshooting Guide</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Step-by-step solutions for common operational issues, validation errors, telephony blocks, and audio configuration hurdles.
      </p>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 20 }}>Common Issues & Resolutions</h2>

      <TroubleItem
        title="1. Campaign Paused with 'Insufficient Balance' Error"
        symptom="A running bulk call campaign stops automatically and displays status PAUSED or FAILED."
        cause="The workspace prepaid wallet balance dropped to zero or reached the overdraft threshold during active dialing."
        solution="Navigate to Billing (/billing) and top up your wallet with Razorpay. Once your balance updates, return to Bulk Call and click Resume."
        icon={<DollarSign size={18} />}
      />

      <TroubleItem
        title="2. Browser Web Call Microphone Access Denied"
        symptom="Clicking 'Web call' in Edit Agent displays an error: 'Microphone access was denied'."
        cause="Your web browser blocked microphone permissions for the Spandan dashboard URL."
        solution="Click the padlock/settings icon on the left side of your browser address bar. Set Microphone to 'Allow' and reload the page."
        icon={<Mic size={18} />}
      />

      <TroubleItem
        title="3. Outbound Calls to Indian (+91) Numbers Failing"
        symptom="Phone test calls or campaigns to Indian numbers immediately return FAILED with carrier rejection codes."
        cause="The caller ID is not registered on the Indian TRAI / DLT portal or the Principal Entity (PE ID) is not bound."
        solution="Complete DLT Principal Entity onboarding and ensure an approved DLT voice header template is linked under Phone Numbers (/phone_numbers)."
        icon={<PhoneCall size={18} />}
      />

      <TroubleItem
        title="4. Agent Speaks Inbound Greeting on Outbound Calls"
        symptom="Agent calls a customer and immediately says 'Thank you for calling Apex Realty'."
        cause="The agent's Welcome Message was configured with an inbound customer support greeting rather than an outbound announcement."
        solution="Open Edit Agent -> Tab 1: Assistant details and rewrite the Welcome Message to an outbound opener: 'Hello, this is Priya calling from Apex Realty regarding your property inquiry.'"
        icon={<AlertTriangle size={18} />}
      />

      <TroubleItem
        title="5. Uploaded PDF Shows 'No Text Extracted'"
        symptom="A file uploaded in Knowledge Base displays 'no text extracted — won't ground agent answers'."
        cause="The uploaded PDF consists of scanned raster images or flat photographs rather than selectable digital text."
        solution="Run the document through an Optical Character Recognition (OCR) tool to embed digital text, or convert the content to a DOCX, CSV, or TXT file before uploading."
        icon={<FileText size={18} />}
      />

      <TroubleItem
        title="6. WhatsApp QR Code Pairing Disconnected"
        symptom="WhatsApp status switches from Connected to Disconnected; follow-up messages fail to send."
        cause="The linked mobile device lost internet connectivity or the WhatsApp web session timed out."
        solution="Open WhatsApp (/whatsapp), select Phone WhatsApp, and re-scan the QR code using the WhatsApp app on your business mobile device."
        icon={<RefreshCw size={18} />}
      />

      {/* Submitting Issues */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>Need Further Assistance?</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        If you encounter an issue not covered above:
      </p>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Submit a diagnostic ticket directly via <Link to="/report-issue" style={{ color: 'var(--teal-fg)', fontWeight: 600 }}>Report Issue</Link> (<code style={{ color: 'var(--teal-fg)' }}>/report-issue</code>) with screenshot attachments.</li>
        <li>Reach out to the support engineering desk at <a href="mailto:support@spandan.ai" style={{ color: 'var(--teal-fg)' }}>support@spandan.ai</a>.</li>
      </ul>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/api-keys" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← API Keys & Developer Access
        </Link>
        <Link to="/docs/user/faq" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          FAQ & Glossary →
        </Link>
      </div>
    </div>
  );
}
