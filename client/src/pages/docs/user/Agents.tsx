import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { Bot, Sliders, Database, Webhook, Rocket } from 'lucide-react';

export default function UserAgents() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Voice AI Setup</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Creating & Configuring AI Voice Agents</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Comprehensive reference for configuring virtual voice assistants, prompt engineering, speech parameters, conversational flows, and post-call webhook automation.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Agent Configuration Lifecycle"
        description="The structured lifecycle from drafting assistant rules to production deployment."
        steps={[
          {
            badge: 'TAB 01',
            title: 'Define Persona & Voice',
            description: 'Set assistant name, welcome greeting, LLM model, voice identity, and system prompt.',
            icon: <Bot size={16} />
          },
          {
            badge: 'TAB 02',
            title: 'Call Parameters',
            description: 'Tune silence timeouts, max duration, interruption rules, and ambient background noise.',
            icon: <Sliders size={16} />
          },
          {
            badge: 'TAB 03-04',
            title: 'Knowledge & Tools',
            description: 'Ground responses in PDF/CSV files and connect live CRM/calendar tools.',
            icon: <Database size={16} />
          },
          {
            badge: 'TAB 05',
            title: 'Post-Call Automation',
            description: 'Extract structured variables and dispatch webhooks to CRM, Slack, or Google Sheets.',
            icon: <Webhook size={16} />
          },
          {
            badge: 'TEST & DEPLOY',
            title: 'Deploy to Production',
            description: 'Verify in browser Web Call or Phone test bench, then hit Deploy.',
            icon: <Rocket size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Overview of the Agent Workbench</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        When you select an assistant or create a new one, you enter the <strong>Edit Agent</strong> workbench (<code style={{ color: 'var(--teal-fg)' }}>/agent/:agentId</code>). The workbench is structured into seven specialized tabs:
      </p>

      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>1. Assistant details:</strong> Persona identity, welcome greeting, LLM model selection, voice provider, transcription service, language options, and flow instructions.</li>
        <li><strong>2. Call configuration:</strong> Telephony boundaries, maximum call length, silence detection timeout, conversational interruption toggle, dynamic variable injection, and ambient room noise.</li>
        <li><strong>3. Knowledge base:</strong> Grounding attachments from your workspace file repository to answer complex domain queries.</li>
        <li><strong>4. Integrations:</strong> Active calendar (Cal.com, Google Calendar), CRM (Salesforce, HubSpot), and custom API webhook tools callable by the agent during calls.</li>
        <li><strong>5. Post-call:</strong> Automated post-call triggers (Webhook, Email, Google Sheets, Google Calendar) and extraction variables (e.g. customer name, appointment time, loan amount).</li>
        <li><strong>6. Chat test:</strong> Rapid text-based testing sandbox to iterate on system prompts and verify response logic without consuming audio minutes.</li>
        <li><strong>7. Recent calls:</strong> Real-time history of test calls and live conversations for this agent, including audio playback, transcripts, and billing extraction records.</li>
      </ul>

      <DocsScreenshotPlaceholder
        title="Edit Agent Workbench Header & Navigation"
        description="The workbench header provides instant testing controls (Chat, Web call, Phone call), View Mode toggling (UI vs raw JSON Code), and the primary Deploy dropdown."
        routePath="/agent/:agentId"
        elements={[
          { label: 'Assistant Name', value: 'Editable title in header bar', type: 'input' },
          { label: 'Test With', value: 'Chat | Web call | Phone call', type: 'button' },
          { label: 'View Mode', value: 'UI / Code (inspect raw JSON config)', type: 'button' },
          { label: 'Deploy Action', value: 'Save and deploy / Save draft / Copy link', type: 'button' }
        ]}
      />

      {/* Tab 1: Assistant Details */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>2. Tab 1: Assistant Details</h2>
      
      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>Welcome Message</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
        The welcome message is the first sentence spoken by the agent immediately when the call is answered.
      </p>
      <DocsCallout type="tip" title="INBOUND VS OUTBOUND GREETINGS">
        For outbound campaigns, avoid saying <em>"Thank you for calling"</em> because your agent initiated the call. Instead use: <em>"Hello, this is Priya calling from Apex Realty regarding your property inquiry. Am I speaking with {`{user_name}`}?"</em>
      </DocsCallout>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>AI Model & Model Catalog</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
        Select the underlying LLM that powers conversational reasoning. Available models are populated from the workspace model catalog:
      </p>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li><strong>Gemini 2.5 Flash:</strong> Ultra-fast, highly contextual model optimized for sub-second conversational turn-taking.</li>
        <li><strong>GPT-4.1 Mini:</strong> Exceptional instruction-following capabilities for structured data extraction and compliance workflows.</li>
        <li><strong>Azure OpenAI:</strong> Dedicated enterprise hosting with data sovereignty guarantees.</li>
      </ul>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Voice & Transcription Selection</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
        Choose a natural voice profile from Google, ElevenLabs, or Cartesia. The voice picker allows you to preview voice audio before saving. Pair it with <strong>Azure Speech</strong> or <strong>Deepgram Nova-2</strong> for real-time speech-to-text recognition.
      </p>

      {/* Tab 2: Call Configuration */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>3. Tab 2: Call Configuration Settings</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Fine-tune how the real-time audio bridge manages conversational pacing and telephony limits:
      </p>

      <div style={{ overflowX: 'auto', marginBottom: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Setting</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>What It Does</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Default Value</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>When to Change</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Max Duration</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Upper limit on call length in minutes before the session is automatically concluded.</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>30 mins</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Reduce to 5-10 mins for short lead qualification or survey calls to protect wallet balance.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Silence Timeout</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Seconds of silence before the agent prompts the customer (e.g., <em>"Are you still there?"</em>).</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>5 secs</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Increase to 8-10 secs if handling elderly callers or complex technical questions.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Interruptible</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Enables VAD speechgate to immediately halt agent speech the moment the user starts talking.</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>Enabled (true)</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Keep enabled for natural human dialogue; disable only for mandatory legal disclosures.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Dynamic Variables</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Enables insertion of contact-specific variables (e.g., <code>{`{user_name}`}</code>, <code>{`{due_date}`}</code>) from CSV data.</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>Enabled (true)</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Keep enabled for personalized outbound campaigns.</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Ambient Sound</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Injects subtle realistic room background noise (Office, Call Center, Cafe) to eliminate digital silence.</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>None (Off)</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Enable <em>Call Center</em> or <em>Office</em> sound to make the agent sound like a live human operator.</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tab 5: Post-Call Actions & Variable Extraction */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>4. Tab 5: Post-Call Automation & Variable Extraction</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Spandan includes an automated post-call intelligence engine that extracts key data points from the call transcript and dispatches them to external webhooks or spreadsheets.
      </p>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>Configuring Extracted Variables</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
        Define specific variables you want the AI to extract upon call conclusion:
      </p>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li><code style={{ color: 'var(--teal-fg)' }}>user_name</code>: Full name of the customer confirmed during the call.</li>
        <li><code style={{ color: 'var(--teal-fg)' }}>appointment_date</code>: Desired date and time confirmed for a booking.</li>
        <li><code style={{ color: 'var(--teal-fg)' }}>interest_level</code>: Lead qualification score (e.g., High, Medium, Low, Not Interested).</li>
        <li><code style={{ color: 'var(--teal-fg)' }}>payment_commitment</code>: Promised payment date or settlement amount agreed upon.</li>
      </ul>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Post-Call Delivery Channels</h3>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>Webhook:</strong> HTTP POST request sent to your server, Zapier, Make, or n8n with full JSON payload (summary, sentiment, transcript, extracted data).</li>
        <li><strong>Email:</strong> Instant notification email containing formatted call summary and recording link.</li>
        <li><strong>Google Sheets:</strong> Appends a new row to a designated Google Sheet with caller attributes and outcomes.</li>
        <li><strong>Google Calendar:</strong> Automatically creates a calendar event using the extracted appointment time.</li>
      </ul>

      {/* Deploying & Saving */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>5. Deploying the Assistant</h2>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Click <strong>Deploy</strong> in the top right corner of the workbench.</li>
        <li>Select <strong>Save and deploy</strong>.</li>
        <li>The assistant status switches to <strong>Deployed</strong>. It is now immediately selectable in <strong>Bulk Call Campaigns</strong> and available for incoming SIP/DID phone numbers.</li>
      </ol>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/voice-assistants" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Voice AI Assistants Overview
        </Link>
        <Link to="/docs/user/clone-voice" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Voice Cloning Studio →
        </Link>
      </div>
    </div>
  );
}
