import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { Radio, Mic, Play, DollarSign } from 'lucide-react';

export default function UserVoiceBroadcast() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Outbound Operations</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Voice Broadcast (One-Way Announcements)</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Deliver pre-recorded audio or synthesized voice announcements to thousands of recipients simultaneously with zero per-turn AI overhead.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Voice Broadcast Creation & Delivery Lifecycle"
        description="The efficient one-way calling pipeline from recording creation to automated delivery and answered-only billing."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Create Recording',
            description: 'Upload an audio file (MP3/WAV) or synthesize once from text via Voice Studio.',
            icon: <Mic size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'Configure Wizard',
            description: 'Select recording, pick Contact Clusters, choose caller IDs, and set repeat counts.',
            icon: <Radio size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Outbound Dialing',
            description: 'Telephony carrier dials recipients; plays the fixed audio asset upon pickup.',
            icon: <Play size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'Answered-Only Billing',
            description: 'Carrier posts status webhook; wallet is charged strictly for answered talk-time.',
            icon: <DollarSign size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. What is Voice Broadcast?</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        <strong>Voice Broadcast</strong> (<code style={{ color: 'var(--teal-fg)' }}>/broadcast</code>) is designed for mass one-way communications where two-way conversational interaction is not required.
      </p>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
        When the recipient answers their phone, Spandan streams your fixed audio recording, optionally repeats it once for clarity, and terminates the call. Because no Speech-to-Text (STT) or Large Language Model (LLM) inference is executed on each turn, Voice Broadcast operates at a fraction of two-way conversational costs.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ fontWeight: 600, color: 'var(--teal)', marginBottom: '8px' }}>Conversational Bulk Call</div>
          <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li>Two-way interactive dialogue.</li>
            <li>Listens to user, answers questions via RAG.</li>
            <li>Dynamic variable extraction & tool calling.</li>
            <li>Best for sales qualifying, scheduling, surveys.</li>
          </ul>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ fontWeight: 600, color: 'var(--coral)', marginBottom: '8px' }}>One-Way Voice Broadcast</div>
          <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li>Fixed audio or synthesized message.</li>
            <li>Plays message and disconnects cleanly.</li>
            <li>Billed strictly for answered carrier talk time.</li>
            <li>Best for alerts, OTPs, reminders, announcements.</li>
          </ul>
        </div>
      </div>

      <DocsImage
        src="/screenshots/voice_broadcast.png"
        alt="Voice Broadcast Management Dashboard"
        caption="Voice Broadcast operations hub: launch audio campaigns, manage recording studio, and monitor deliveries"
      />

      <DocsScreenshotPlaceholder
        title="Voice Broadcast Operations Dashboard"
        description="Master broadcast list with tabs for active broadcasts and the Recording Studio, rate-per-minute banners, and creation wizard."
        routePath="/broadcast"
        elements={[
          { label: 'View Tabs', value: 'Broadcasts | Recordings Studio', type: 'button' },
          { label: 'Rate Banner', value: 'Current platform wallet rate per minute (INR)', type: 'badge' },
          { label: 'New Broadcast', value: 'Opens the 3-step broadcast wizard', type: 'button' }
        ]}
      />

      {/* Step-by-Step Guide */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Step-by-Step: Creating a Voice Broadcast</h2>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>Step 1: Create a Broadcast Recording</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
        Under the <strong>Recordings</strong> tab in the Broadcast studio:
      </p>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li><strong>Option A: Upload Audio:</strong> Upload an MP3 or WAV file. The system measures the exact duration in seconds (rounded up to the next whole second).</li>
        <li><strong>Option B: Text-to-Speech Script:</strong> Type your script, choose a neural voice from the catalog, and click <strong>Synthesize Audio</strong>. The audio is generated once and stored for high-volume reuse.</li>
      </ul>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Step 2: Launch the Broadcast Wizard</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Click <strong>New Broadcast</strong>.</li>
        <li><strong>Broadcast Name:</strong> Enter a title (e.g., <em>"Water Supply Maintenance Alert"</em>).</li>
        <li><strong>Select Recording:</strong> Choose the audio asset created in Step 1.</li>
        <li><strong>Select Audience:</strong> Check the target Contact Clusters. The same address book, deduplication rules, and opt-out filters from Bulk Calling apply.</li>
        <li><strong>Caller IDs:</strong> Select the outbound numbers to display on recipients' phones.</li>
        <li><strong>Repeat Count:</strong> Choose whether the recording plays <strong>1x</strong> or <strong>2x</strong> (recommended for crucial phone numbers or addresses).</li>
        <li>Click <strong>Launch Broadcast</strong>.</li>
      </ol>

      {/* Commercial Model */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>3. Answered-Only Commercial Billing</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Voice broadcasts are billed with complete commercial transparency:
      </p>

      <DocsCallout type="tip" title="ZERO CHARGE FOR UNANSWERED CALLS">
        If a customer's phone is switched off, busy, or goes unanswered, you are charged ₹0.00. The wallet balance is debited strictly when a call is answered by a human recipient or voicemail.
      </DocsCallout>

      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>Carrier Status Callbacks:</strong> The telephony provider sends an authenticated callback upon call termination with exact connected seconds.</li>
        <li><strong>Compare-and-Set Guard:</strong> Every broadcast recipient row enforces double-charge protection (`billingStatus: PENDING → BILLED`).</li>
        <li><strong>Spent Tracking:</strong> The broadcast details modal displays live running totals of total recipients, answered calls, and exact rupees deducted.</li>
      </ul>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/bulk-campaigns" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Bulk Call Campaigns
        </Link>
        <Link to="/docs/user/call-logs" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Call Logs & Audio Waveforms →
        </Link>
      </div>
    </div>
  );
}
