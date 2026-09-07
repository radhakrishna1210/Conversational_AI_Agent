import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { PhoneCall, Play, Users, ShieldCheck } from 'lucide-react';

export default function UserBulkCampaigns() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Outbound Operations</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Bulk Call Campaigns</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Launch automated, high-volume two-way Voice AI calling campaigns across contact lists with real-time progression, caller ID rotation, and deduplication.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Bulk Campaign Creation & Execution Lifecycle"
        description="The multi-step workflow from audience selection and caller ID configuration to live campaign monitoring."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Select Agent',
            description: 'Choose the deployed conversational Voice AI assistant to handle calls.',
            icon: <PhoneCall size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'Select Audience',
            description: 'Pick Contact Clusters or upload a fresh CSV file for auto-clustering.',
            icon: <Users size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Configure Telephony',
            description: 'Select caller IDs for rotation and set maximum concurrent lines.',
            icon: <ShieldCheck size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'Launch & Monitor',
            description: 'Start immediately or schedule. Monitor real-time progress and live recipient logs.',
            icon: <Play size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. What are Bulk Call Campaigns?</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        The <strong>Bulk Call</strong> engine (<code style={{ color: 'var(--teal-fg)' }}>/bulk_call</code>) automates outbound phone calls at scale. Unlike basic robocallers that play a static sound file, Spandan bulk campaigns place <strong>two-way conversational Voice AI agents</strong> on the phone line.
      </p>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
        When the recipient answers, the agent engages in dynamic dialogue, answers questions using attached Knowledge Base files, personalizes the conversation using customer CSV attributes, and extracts structured outcomes (such as appointment bookings or lead qualification scores).
      </p>

      <DocsImage
        src="/screenshots/Bulk_calls_campaign.png"
        alt="Bulk Call Campaigns Overview Hub"
        caption="Bulk Call Campaigns hub: monitor campaign status, dial progress, caller IDs, and live recipient outcomes"
      />

      <DocsScreenshotPlaceholder
        title="Bulk Call Campaigns Overview Hub"
        description="The master campaign list displaying campaign status, agent name, rotated caller IDs, dial progress bars, sent/failed metrics, and control buttons."
        routePath="/bulk_call"
        elements={[
          { label: 'New Campaign', value: 'Opens the campaign creation modal', type: 'button' },
          { label: 'Filters', value: 'Search by name | Filter by Status | Filter by Bot', type: 'input' },
          { label: 'Campaign Row', value: 'Progress bar, Sent vs Failed counts, Status Badge', type: 'text' },
          { label: 'Row Actions', value: 'Start / Resume | Pause | Cancel | Delete', type: 'button' }
        ]}
      />

      {/* Step-by-Step Creation */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Step-by-Step: Creating a Campaign</h2>

      <DocsImage
        src="/screenshots/Campaign_creation.png"
        alt="Campaign Creation Configuration Wizard"
        caption="Campaign creation modal: select Voice AI bot, target contact clusters, and caller IDs"
      />

      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Navigate to <strong>Bulk Call</strong> (<code style={{ color: 'var(--teal-fg)' }}>/bulk_call</code>) and click <strong>New Campaign</strong>.</li>
        <li><strong>Campaign Name:</strong> Enter a recognizable name (e.g., <em>"Diwali Festive Loan Outreach"</em>).</li>
        <li><strong>Select Assistant (Bot):</strong> Choose the agent that will conduct the conversations. The system displays a <strong>Call Mode Preview</strong> confirming full two-way conversational mode.</li>
        <li><strong>Choose Audience Source:</strong>
          <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
            <li><em>Select Existing Clusters:</em> Check one or more pre-existing Contact Clusters.</li>
            <li><em>Upload New CSV:</em> Drag and drop a spreadsheet. It is automatically imported into a new cluster.</li>
          </ul>
        </li>
        <li><strong>Inspect Audience Deduplication Preview:</strong> Review the calculated statistics:
          <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
            <li>Total Rows vs. Unique Phone Numbers</li>
            <li>Deduplicated Duplicates Skipped</li>
            <li>Opted-Out Contacts Skipped</li>
            <li>Net Dialable Contacts Count</li>
          </ul>
        </li>
        <li><strong>Caller ID Selection:</strong> Select one or more verified caller IDs or platform numbers. If multiple numbers are checked, Spandan automatically rotates across them during dialing.</li>
        <li><strong>Concurrency:</strong> Set the number of simultaneous active outbound lines.</li>
        <li>Click <strong>Create Campaign</strong>.</li>
      </ol>

      {/* Campaign Status Lifecycle */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>3. Campaign Statuses & Controls</h2>

      <div style={{ overflowX: 'auto', marginBottom: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Badge</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Meaning</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Available User Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--tx-2)' }}>DRAFT</td>
              <td style={{ padding: '12px 16px' }}>Gray</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Created but not yet started. Audience frozen.</td>
              <td style={{ padding: '12px 16px', color: 'var(--teal-fg)', fontWeight: 600 }}>Start Campaign / Delete</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--cyan-fg)' }}>RUNNING</td>
              <td style={{ padding: '12px 16px' }}>Teal (Animated)</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Currently placing calls according to concurrency limits.</td>
              <td style={{ padding: '12px 16px', color: 'var(--warn)', fontWeight: 600 }}>Pause / Cancel</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--warn)' }}>PAUSED</td>
              <td style={{ padding: '12px 16px' }}>Yellow</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Temporarily halted. In-flight calls conclude; no new dials.</td>
              <td style={{ padding: '12px 16px', color: 'var(--lime)', fontWeight: 600 }}>Resume / Cancel</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--lime)' }}>COMPLETED</td>
              <td style={{ padding: '12px 16px' }}>Green</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>All dialable recipients processed.</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>View Reports / Export CSV</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--err)' }}>FAILED</td>
              <td style={{ padding: '12px 16px' }}>Red</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Stopped due to wallet depletion or carrier gateway error.</td>
              <td style={{ padding: '12px 16px', color: 'var(--teal-fg)', fontWeight: 600 }}>Retry / Top Up Wallet</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocsCallout type="note" title="CONCURRENCY & PACING">
        During active execution, Spandan's distributed Redis queue dispatches calls up to your configured concurrency. As individual calls terminate, the queue instantly feeds the next queued recipient without carrier throttling.
      </DocsCallout>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/contacts" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Contacts & Clusters
        </Link>
        <Link to="/docs/user/voice-broadcast" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Voice Broadcast →
        </Link>
      </div>
    </div>
  );
}
