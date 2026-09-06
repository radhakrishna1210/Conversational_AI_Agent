import { Link } from 'react-router-dom';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { FileText, Play, Download, Headphones } from 'lucide-react';

export default function UserCallLogs() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Monitoring & Insights</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Call Logs & Audio Waveform Player</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Inspect full call histories, listen to authenticated audio recordings in the waveform player, filter by date ranges, and export call records for auditing.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Call Logging & Audio Playback Flow"
        description="How call telemetry, audio recordings, and billing data are aggregated into the call logs console."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Call Termination',
            description: 'Telephony stream closes; carrier synchronizes audio recording and duration.',
            icon: <FileText size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'Audio Pipeline',
            description: 'Full-call recording is secured in private workspace storage; signed URL generated.',
            icon: <Headphones size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Inspection & Waveform',
            description: 'Listen to call playback with scrubbable waveform and synchronized speaker tags.',
            icon: <Play size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'Export Data',
            description: 'Download CSV reports with duration, cost, sentiment, and caller identifiers.',
            icon: <Download size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Overview of the Call Logs Console</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        The <strong>Call Logs</strong> page (<code style={{ color: 'var(--teal-fg)' }}>/call_logs</code>) uses a master-detail split screen layout. The left column provides a quick scanning feed of recent calls, while the right pane opens the selected call's detailed waveform player, full transcript, and extracted entity data.
      </p>

      <DocsImage
        src="/screenshots/Call_logs.png"
        alt="Call Logs and Audio Playback Console"
        caption="Call Logs interface: review call history, duration, costs, outcomes, and playback waveforms"
      />

      <DocsScreenshotPlaceholder
        title="Call Logs Master-Detail Interface"
        description="Left-hand call list with quick search and date range filters; right-hand inspection view with audio player, speaker breakdown, and sentiment scores."
        routePath="/call_logs"
        elements={[
          { label: 'Time Filters', value: '7 Days | 30 Days | 90 Days', type: 'button' },
          { label: 'Status Filter', value: 'All | Completed | Failed | No Answer', type: 'button' },
          { label: 'Search Input', value: 'Debounced search by phone number or assistant', type: 'input' },
          { label: 'Export Action', value: 'Export CSV of current filtered view', type: 'button' }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Using the Audio Waveform Player</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Every completed call where audio recording is supported features an integrated audio player:
      </p>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>Authenticated Streaming:</strong> Audio streams securely using workspace bearer authentication tokens. Raw recording URLs are never exposed publicly.</li>
        <li><strong>Interactive Seeking:</strong> Click any point on the playback timeline to jump directly to that moment in the conversation.</li>
        <li><strong>Playback Speed Controls:</strong> Toggle playback rates (1x, 1.25x, 1.5x, 2x) for rapid supervisor quality audits.</li>
      </ul>

      {/* Call Log Fields */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>3. Call Log Metadata Fields</h2>

      <div style={{ overflowX: 'auto', marginBottom: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Field Name</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Type</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Started At</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>Timestamp</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Exact date, time, and relative age (e.g. <em>"12m ago"</em>, <em>"2h ago"</em>).</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Assistant</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>String</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Name of the Voice AI agent that handled the call.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>From / To</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>Phone Number</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Caller ID and destination phone numbers in international E.164 format.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Duration</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>Formatted Time</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Total connected call duration (e.g. <em>02:45</em>).</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Status & Outcome</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>Tone Badge</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Completed, Failed, Busy, No-Answer, or Voicemail Detected.</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Billed Cost</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>INR Currency</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Exact rupees deducted from wallet balance for this conversation.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>4. Exporting Call Data to CSV</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        To export call logs for compliance audits, CRM import, or reporting:
      </p>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Set your desired date range (<strong>7d</strong>, <strong>30d</strong>, or <strong>90d</strong>).</li>
        <li>Optionally apply status filters or search queries to narrow the dataset.</li>
        <li>Click <strong>Export CSV</strong> in the top action bar.</li>
        <li>The system downloads <code style={{ color: 'var(--teal-fg)' }}>spandan-calls-[range].csv</code> containing all columns including timestamps, durations, phone numbers, costs, sentiment, and outcomes.</li>
      </ol>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/voice-broadcast" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Voice Broadcast
        </Link>
        <Link to="/docs/user/calls-logs" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Conversation Transcripts & Variables →
        </Link>
      </div>
    </div>
  );
}
