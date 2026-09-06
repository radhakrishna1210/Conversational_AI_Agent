import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevArchitecture() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>2. System Architecture Specification</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        The authoritative architectural blueprint of Spandan—mapping component boundaries, real-time audio streams, latency budgets, background processing queues, tenant security, data persistence, and codebase traceability.
      </p>

      {/* ── 2.1 SYSTEM AT A GLANCE ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2.1 System at a Glance</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan is an enterprise-grade Conversational AI platform designed for sub-second voice turn-taking and high-concurrency campaign execution.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Dimension</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Technology / Implementation</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source Location</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Frontend Client</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>React 18, TypeScript, Vite, React Router v6 SPA</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>client/src/</code></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Backend Application</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Node.js (ESM), Express.js framework (Port 4000)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>backend/src/app.js</code>, <code>backend/src/server.js</code></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Database &amp; ORM</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>PostgreSQL, Prisma ORM, PgBouncer Pooler (Port 6543)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>backend/prisma/schema.prisma</code></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Queue &amp; Cache</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis (ioredis singleton), BullMQ (<code>campaign-dispatch</code>)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>backend/src/queues/campaign.queue.js</code></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Real-Time Audio</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>WebSocket media bridges, VAD speech gating, 20ms frame pacers</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>backend/src/ws/modularMediaBridge.js</code></td>
          </tr>
        </tbody>
      </table>

      {/* ── 2.2 HIGH-LEVEL SYSTEM ARCHITECTURE ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2.2 High-Level System Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The physical and logical boundaries of the platform detailing protocol transports and network layers:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  subgraph CLIENT_LAYER ["USER / BROWSER BOUNDARY"]
    Browser["React 18 SPA"]
    PhoneUser["PSTN / Mobile Phone Caller"]
  end

  subgraph APPLICATION_LAYER ["APPLICATION SERVER BOUNDARY"]
    ExpressApp["Express Gateway & APIs"]
    WSGateway["WebSocket Upgrade Router"]
    MediaBridge["WebSocket Media Bridge"]
    Services["Domain Services (Agents, Campaigns)"]
    
    ExpressApp --> Services
    WSGateway --> MediaBridge
  end

  subgraph DATA_PERSISTENCE ["DATA & QUEUE BOUNDARY"]
    PgBouncer["PgBouncer Pooler"] --> Postgres[(PostgreSQL)]
    RedisStore[(Redis Server / BullMQ)]
  end

  subgraph THIRD_PARTY ["THIRD-PARTY VENDOR BOUNDARY"]
    TelephonyCarriers["Telephony (Twilio/Plivo)"]
    STTVendors["Deepgram STT (WSS)"]
    LLMVendors["LLM Engines (OpenAI/Gemini)"]
    TTSVendors["TTS Engines (ElevenLabs/Cartesia)"]
  end

  Browser -->|HTTPS REST| ExpressApp
  PhoneUser <-->|PSTN Network| TelephonyCarriers
  TelephonyCarriers -->|WSS Media Stream| WSGateway
  Services -->|SQL| PgBouncer
  Services -->|Jobs| RedisStore
  
  MediaBridge -->|Audio Stream| STTVendors
  STTVendors -->|Text| LLMVendors
  LLMVendors -->|Tokens| Services
  Services -->|Sentence| TTSVendors
  TTSVendors -->|Audio| MediaBridge`}
        </pre>
      </div>

      {/* ── 2.3 REAL-TIME VOICE PIPELINE ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2.3 Real-Time Voice Pipeline (STT → LLM → TTS)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The core of the application. This pipeline handles the real-time audio transport, turn detection, interruptions, and orchestration between speech services.
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Customer(("Customer Phone")) -->|RTP Audio| Telephony["Telephony Provider"]
  Telephony -->|WSS Stream| WSBridge["WebSocket Media Bridge"]
  
  WSBridge -->|Raw Audio| VAD["Voice Activity Detection (VAD)"]
  
  subgraph AI_PIPELINE ["Live AI Conversation Loop"]
    VAD -->|Speech Filtered| STT["Speech-to-Text (Streaming)"]
    STT -->|Partial/Final Text| LLM["LLM Agent Orchestrator"]
    LLM <-->|Function Calls| Tools["External Tools / APIs"]
    LLM -->|Token Stream| TTS["Text-to-Speech (Streaming)"]
  end
  
  TTS -->|Raw Audio Chunks| Pacer["20ms Audio Pacer"]
  Pacer -->|WSS Audio Frame| Telephony
  
  %% Interruption Path
  VAD -.->|Barge-in Signal| Interruption["Cancel TTS & Flush Pacer"]
  Interruption -.-> Pacer`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>Pipeline Mechanics</h3>
      <ul style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li><strong>VAD & Barge-in:</strong> Endpoint detection identifies when a user stops speaking. If a user speaks while the bot is active, the VAD immediately emits a cancellation signal to flush the TTS sentence buffer and halt outbound pacing.</li>
        <li><strong>STT Stream:</strong> Audio is pushed to Deepgram in real-time. Finalized transcripts are injected into the LLM context array.</li>
        <li><strong>Tool Execution:</strong> If the LLM identifies a tool call (e.g., <code>bookAppointment</code>), TTS is paused until the background Service resolves the external API request.</li>
        <li><strong>Pacing:</strong> Incoming TTS audio chunks are buffered and metered out at exactly 20ms intervals via <code>ulawPacer.js</code> to prevent carrier packet rejection.</li>
      </ul>

      {/* ── 2.4 LATENCY & PERFORMANCE ARCHITECTURE ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2.4 Latency Budget & Tracing</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Sub-second conversational latency is critical. We measure latency from the moment the user stops speaking (Endpoint Detection) to the moment the first audio byte reaches their ear.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Component Phase</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Target Budget</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Measurement Trigger</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>VAD Endpoint Detection</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>200 ms</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Silence threshold met</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>STT Finalization</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>100 ms</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Final transcript payload received</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>LLM TTFT (Time to First Token)</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>350 ms</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>First token streamed from provider</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>TTS TTFB (Time to First Byte)</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>200 ms</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>First audio chunk synthesized</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-primary)' }}><strong>Total Response Latency</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-primary)' }}><strong>~850 ms</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Perceived by end-user</td>
          </tr>
        </tbody>
      </table>

      {/* ── 2.5 CALL STATE MACHINE & IN-MEMORY STATE ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2.5 Call State Machine & Memory Management</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        A clear distinction exists between the <strong>in-memory Voice Session</strong> (active runtime) and the <strong>persisted Call Record</strong> (database ledger).
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`stateDiagram-v2
    [*] --> CREATED: API Request
    CREATED --> QUEUED: Enqueued in BullMQ
    QUEUED --> DIALING: Telephony worker picks job
    DIALING --> RINGING: Carrier Webhook
    
    RINGING --> NO_ANSWER: Timeout
    RINGING --> BUSY: Carrier Signal
    RINGING --> ANSWERED: Caller Pickup
    
    ANSWERED --> IN_PROGRESS: WSS Connected / AI Active
    
    IN_PROGRESS --> DISCONNECTED: Caller Hangs Up
    IN_PROGRESS --> ERROR: WSS Drop / Provider Fail
    
    DISCONNECTED --> COMPLETED: CallFinalizer cleanup
    COMPLETED --> [*]`}
        </pre>
      </div>

      <DocsCallout type="note" title="Memory vs Persistence">
        During the <code>IN_PROGRESS</code> state, active variables (LLM contexts, STT buffers, active tools) reside purely in Node.js RAM within the <code>CallSession</code> object. Only upon transitioning to <code>COMPLETED</code> or <code>DISCONNECTED</code> does the <code>callFinalizer.js</code> execute a Prisma transaction to write the transcript, calculate billing, and save the final <code>CallLog</code> to PostgreSQL.
      </DocsCallout>

      {/* ── 2.6 END-TO-END CAMPAIGN FLOW ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2.6 Campaign Dispatch Flow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Bulk outbound voice campaigns run asynchronously through Redis-backed BullMQ queues to preserve main thread performance.
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`flowchart TD
  Campaign[Active Campaign] --> Scheduler[Campaign Scheduler]
  Scheduler --> Contacts[Contact Selection]
  Contacts --> Queue[Call Queue - BullMQ]
  Queue --> Worker[campaign.worker.js]
  
  Worker --> Telephony[Telephony API Dial]
  Telephony --> CallResult{Outcome?}
  
  CallResult -->|Answered| WSS[Establish WebSocket to AI Engine]
  CallResult -->|No Answer / Busy| RetryLogic[Retry Strategy]
  RetryLogic -->|Max attempts reached| FailedStatus[Mark FAILED]
  RetryLogic -->|Retry eligible| Queue`}
        </pre>
      </div>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/overview" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Overview
        </Link>
        <Link to="/docs/developer/database" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Database Architecture →
        </Link>
      </div>
    </div>
  );
}