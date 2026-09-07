import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { Phone, ShieldCheck, CheckCircle2, RotateCw, Globe } from 'lucide-react';

export default function UserPhoneNumbers() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Telephony & Compliance</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Phone Numbers & DLT Compliance</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Manage platform telephone lines, verify your own business caller IDs, and complete regulatory TRAI / DLT onboarding for outbound calling in India.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Telephony Provisioning & Verification Lifecycle"
        description="How numbers are inventoried, verified, and authorized for high-volume conversational calling."
        steps={[
          {
            badge: 'OPTION A',
            title: 'Platform Numbers',
            description: 'Pre-provisioned telephony lines allocated directly to your workspace.',
            icon: <Phone size={16} />
          },
          {
            badge: 'OPTION B',
            title: 'Verify Your Own Number',
            description: 'Verify your existing business caller ID via instant automated OTP ringback.',
            icon: <RotateCw size={16} />
          },
          {
            badge: 'INDIA OUTBOUND',
            title: 'TRAI / DLT Registration',
            description: 'Submit Principal Entity PE ID, KYC docs, and DLT voice greeting templates.',
            icon: <ShieldCheck size={16} />
          },
          {
            badge: 'READY',
            title: 'Dial Campaigns',
            description: 'Assign numbers to agents or rotate caller IDs across bulk dialers.',
            icon: <CheckCircle2 size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Phone Number Inventory Overview</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Navigate to <strong>Phone Numbers</strong> (<code style={{ color: 'var(--teal-fg)' }}>/phone_numbers</code>) to view all active numbers available to your workspace. The platform categorizes numbers into two operational types:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cyan-fg)', fontWeight: 600, marginBottom: '8px' }}>
            <Globe size={18} />
            <span>Platform Numbers</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Dedicated DIDs provided by carrier integrations (Twilio, Plivo, Piopiy). Ready to make outbound calls and receive inbound voice calls immediately.
          </p>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--lime)', fontWeight: 600, marginBottom: '8px' }}>
            <CheckCircle2 size={18} />
            <span>Verified Own Numbers</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Your company's existing mobile or landline numbers verified as approved caller IDs. Customers see your recognized business number when the AI calls them.
          </p>
        </div>
      </div>

      <DocsImage
        src="/screenshots/Phone_Numbers.png"
        alt="Phone Numbers Management Console"
        caption="Phone numbers inventory: manage carrier lines, verified caller IDs, and country routes"
      />

      <DocsScreenshotPlaceholder
        title="Phone Numbers Dashboard"
        description="Overview of total available numbers, platform carriers, verified own caller IDs, and country prefixes."
        routePath="/phone_numbers"
        elements={[
          { label: 'Total Numbers', value: 'Live count of all dialable lines', type: 'badge' },
          { label: 'Platform Lines', value: 'Carriers: Twilio, Plivo, Piopiy', type: 'text' },
          { label: 'Verified Own', value: 'Caller IDs verified via OTP ringback', type: 'text' },
          { label: 'Country Flags', value: '🇮🇳 +91, 🇺🇸 +1, 🇬🇧 +44, 🇦🇺 +61, 🇸🇬 +65, 🇦🇪 +971', type: 'text' }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. How to Verify Your Own Caller ID Number</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        To call customers using your existing business number as the outbound caller ID:
      </p>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Open <strong>Voice AI Assistants</strong> and click your agent to open the workbench.</li>
        <li>Under <strong>Tab 2: Call configuration</strong>, find the <strong>Caller ID Number</strong> section.</li>
        <li>Click <strong>Verify New Number</strong>.</li>
        <li>Enter your phone number in full international E.164 format (e.g. <code style={{ color: 'var(--teal-fg)' }}>+919876543210</code>).</li>
        <li>Click <strong>Start Verification</strong>. The telephony carrier will immediately place an automated call to your phone.</li>
        <li>Answer your phone and enter the numerical verification code displayed on your screen.</li>
        <li>Upon successful confirmation, the number is marked <strong>Verified</strong> and appears in your caller ID dropdown across the platform.</li>
      </ol>

      {/* DLT Compliance Section */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>3. TRAI / DLT Regulatory Onboarding for India (+91)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        To place commercial automated phone calls to Indian mobile subscribers, telecom regulations require verified DLT registration:
      </p>

      <DocsCallout type="important" title="REGULATORY REQUIREMENT">
        Outbound calls to Indian phone numbers without approved DLT registration will be automatically rejected by telecom operators at the carrier gateway.
      </DocsCallout>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', margin: '24px 0' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontWeight: 600, color: 'var(--teal-fg)', marginBottom: '6px' }}>1. Principal Entity (PE ID)</div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Register your business entity on any telecom DLT portal (Airtel, Jio, Vodafone Idea, BSNL, Tata) to obtain your 19-digit PE ID.
          </p>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontWeight: 600, color: 'var(--teal-fg)', marginBottom: '6px' }}>2. Telemarketer (TM) Binding</div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Bind your PE ID to the Spandan Telemarketer ID on your carrier portal to grant transmission authorization.
          </p>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontWeight: 600, color: 'var(--teal-fg)', marginBottom: '6px' }}>3. Voice Header & Templates</div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Register your outbound voice greeting script template and fixed 6-character sender headers (e.g. <code>SPNDAN</code>).
          </p>
        </div>
      </div>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Submitting Compliance Documents</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>From the left sidebar, navigate to <strong>Settings</strong> (<code style={{ color: 'var(--teal-fg)' }}>/settings</code>).</li>
        <li>Open the <strong>DLT & Telephony Compliance</strong> tab.</li>
        <li>Enter your registered <strong>Principal Entity ID</strong> and company name.</li>
        <li>Upload your DLT certificate and authorized signatory KYC documents.</li>
        <li>Click <strong>Submit for Verification</strong>. The compliance team verifies your credentials with carrier databases within 24–48 business hours.</li>
      </ol>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/knowledge-base" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Knowledge Base Grounding
        </Link>
        <Link to="/docs/user/contacts" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Contacts & Audience Clusters →
        </Link>
      </div>
    </div>
  );
}
