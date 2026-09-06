import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevWebSockets() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>6. WebSockets &amp; Real-Time System</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        This page details Spandan's real-time WebSocket audio bridges, Speech-to-Text streaming, Voice Activity Detection, and conversation finalization.
      </p>

      <DocsCallout type="important" title="REAL-TIME TIMING SENSITIVITY">
        WebSocket audio frame processing operates on strict 20ms pacing boundaries. Thread blocking inside backend routers or services will directly degrade audio quality, manifesting as voice jitter, delay, or dropped words.
      </DocsCallout>

      {/* ── 6.1 REAL-TIME SYSTEM OVERVIEW ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.1 Real-Time System Overview</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan uses persistent WebSocket connections to stream two-way audio between callers and AI agents. Unlike standard stateless REST request-response cycles, real-time telephony pipelines require low-latency audio transmission, voice activity gates, and instant audio interruptions.
      </p>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Caller[Telephony / Browser Client] -->|Binary audio stream| WsBridge[WebSocket Media Bridge modularMediaBridge.js]
  WsBridge -->|20ms Audio frames| VAD[speechGate.js VAD Filter]
  VAD -->|Filtered speech audio| STT[Deepgram Speech-to-Text]
  STT -->|Final transcript text| LLM[LLM Engine via llm.factory.js]
  LLM -->|Streamed text tokens| Buffer[sentenceBuffer.js Token Buffer]
  Buffer -->|Complete sentences| TTS[TTS Engine via ttsStreamFactory.js]
  TTS -->|Synthesized speech audio| Pacer[ulawPacer.js / pcmStreamPacer.js]
  Pacer -->|Paced audio output| WsBridge
  WsBridge -->|Base64 audio frames| Caller`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This diagram illustrates the real-time audio processing loop. Incoming base64 binary audio from telephony carriers or browsers is received by `modularMediaBridge.js`, passed through `speechGate.js` VAD, transcribed by Deepgram, processed by LLMs, buffered into complete sentences, synthesized by TTS engines, and paced into 20ms frames before being sent back to the caller.
      </p>


      {/* ── 6.2 REAL-TIME ARCHITECTURE ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.2 Real-Time Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The real-time audio pipeline integrates the following components:
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Component</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Responsibility</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source File Reference</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>HTTP Upgrade routing</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Matches incoming URL paths and upgrades TCP connections to WebSockets.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/server.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Media stream bridge</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Handles WebSocket framing, base64 payload decoding, and audio forwarding.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/ws/modularMediaBridge.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Voice activity gate</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Filters silence and background hum, detecting caller speech.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/stt/speechGate.js`</td>
          </tr>
        </tbody>
      </table>


      {/* ── 6.3 WEBSOCKET SERVER INITIALIZATION ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.3 WebSocket Server Initialization</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The HTTP server is wrapped in <code>backend/src/server.js</code>. The app initializes four distinct <code>WebSocketServer</code> instances with the <code>noServer: true</code> configuration option to manage upgrades:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>webCallWss</code>: Handles xAI bundled voice calls.</li>
        <li style={{ marginBottom: 6 }}><code>modularWebCallWss</code>: Handles modular web voice calls.</li>
        <li style={{ marginBottom: 6 }}><code>twilioMediaWss</code>: Handles Twilio carrier streams.</li>
        <li style={{ marginBottom: 6 }}><code>plivoMediaWss</code>: Handles Plivo carrier streams.</li>
      </ul>


      {/* ── 6.4 HTTP UPGRADE HANDLING ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.4 HTTP Upgrade Handling</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The server intercept listens for upgrade requests:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`httpServer.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, \`http://\${req.headers.host}\`);
  const twilioMatch = pathname.match(TWILIO_MEDIA_UPGRADE_PATH);
  if (twilioMatch) {
    const [, workspaceId, agentId] = twilioMatch;
    resolveBundledEngine(workspaceId, agentId).then((bundled) => {
      twilioMediaWss.handleUpgrade(req, socket, head, (ws) => {
        if (bundled) handleTwilioMediaUpgrade(ws, { workspaceId, agentId });
        else handleTwilioMediaModularUpgrade(ws, { workspaceId, agentId });
      });
    });
  }
});`}
        </code>
      </pre>


      {/* ── 6.5 WEBSOCKET ENDPOINT INVENTORY ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.5 WebSocket Endpoint Inventory</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system maps incoming upgrade paths to dedicated handlers using regular expressions:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Bundled Web Calls:</strong> <code>/^\/api\/v1\/workspaces\/([^/]+)\/agents\/([^/]+)\/xai-call$/</code> &rarr; upgraded to <code>webCallWss</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>Modular Web Calls:</strong> <code>/^\/api\/v1\/workspaces\/([^/]+)\/agents\/([^/]+)\/web-call$/</code> &rarr; upgraded to <code>modularWebCallWss</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>Twilio Carrier Streams:</strong> <code>/^\/api\/v1\/twilio-media\/([^/]+)\/([^/]+)$/</code> &rarr; upgraded to <code>twilioMediaWss</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>Plivo Carrier Streams:</strong> <code>/^\/api\/v1\/plivo-media\/([^/]+)\/([^/]+)$/</code> &rarr; upgraded to <code>plivoMediaWss</code>.</li>
      </ul>


      {/* ── 6.6 CONNECTION ESTABLISHMENT ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.6 Connection &amp; Session Lifecycle Sequence</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When the handshake succeeds, the server completes the HTTP 101 protocol upgrade, attaches event listeners, and initializes the conversation:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`sequenceDiagram
  autonumber
  actor Carrier as Telephony Carrier / Web Client
  participant Server as Express Server (server.js)
  participant Router as WSS Upgrade Matcher
  participant Handler as Media Bridge (modularMediaBridge.js)
  participant Engine as Real-Time Voice Engine
  participant Finalizer as callFinalizer.js
  participant DB as PostgreSQL DB

  Carrier->>Server: (1) HTTP GET /twilio-media/:workspaceId/:agentId (Upgrade: websocket)
  Server->>Router: (2) Match Regex & Resolve Agent Config
  Router->>Carrier: (3) HTTP 101 Switching Protocols
  Router->>Handler: (4) Instantiate Session & Connect Provider Sockets
  Carrier->>Handler: (5) Stream Binary Audio Frames (g711_ulaw / PCM)
  Handler->>Engine: (6) Process STT -> LLM -> TTS Voice Turn Loop
  Engine-->>Carrier: (7) Stream Synthesized Audio Frames (20ms Pacing)
  Carrier->>Handler: (8) Call Disconnect / Hangup Frame
  Handler->>Finalizer: (9) Trigger finalizeCallSession()
  Finalizer->>DB: (10) Deduct Wallet Balance & Save Call Log Record`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This sequence diagram outlines the entire lifecycle of a WebSocket voice session. It traces the process from initial HTTP 101 upgrade handshake in `server.js` through route matching, session instantiation in `modularMediaBridge.js`, bidirectional 20ms audio streaming, and call disconnect through to finalization in `callFinalizer.js` and DB persistence.
      </p>


      {/* ── 6.7 CONNECTION AUTHENTICATION & CONTEXT ──────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.7 Connection Authentication &amp; Context</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Unlike authenticated REST routes, carrier WebSocket endpoints (such as Twilio and Plivo paths) are public because carriers cannot submit authorization tokens. The endpoints verify the call context by reading parameters (such as <code>callLogId</code>) from the query string.
      </p>


      {/* ── 6.8 SESSION INITIALIZATION ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.8 Session Initialization</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        A call session is represented by a handler class instance (such as <code>ModularMediaBridge</code>). The constructor retrieves the agent settings, reads the prompt context, and opens connection handles to external AI providers.
      </p>


      {/* ── 6.9 MESSAGE PROTOCOLS ────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.9 Message Protocols</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Active calls exchange structured JSON message payloads:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Twilio Media stream:</strong> Incoming payloads contain base64-encoded audio data: <code>&#123; event: "media", media: &#123; payload: "..." &#125; &#125;</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>Outgoing playback:</strong> Outbound audio payloads use the same base64 formatting: <code>&#123; event: "media", media: &#123; payload: "..." &#125;, streamSid: "..." &#125;</code>.</li>
      </ul>


      {/* ── 6.10 INCOMING AUDIO PROCESSING ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.10 Incoming Audio Processing</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The bridge decodes incoming base64-encoded buffers, checks the voice activity detection threshold, and streams the raw audio frames to the STT provider.
      </p>


      {/* ── 6.11 AUDIO ENCODING & SAMPLE RATES ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.11 Audio Encoding &amp; Sample Rates</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Telephony streams use G.711 &mu;-law encoding at an 8kHz sample rate. The modular voice pipeline converts G.711 &mu;-law audio to 16kHz PCM (and vice versa) to match the requirements of the speech-to-text and text-to-speech providers.
      </p>


      {/* ── 6.12 AUDIO BUFFERING ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.12 Audio Buffering</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Pacer utility classes (such as <code>ulawPacer.js</code>) buffer outbound audio chunks, using 20ms frame sizes to prevent buffer overflows at the carrier leg.
      </p>


      {/* ── 6.13 VOICE ACTIVITY DETECTION ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.13 Voice Activity Detection</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system uses a custom VAD module (<code>backend/src/services/stt/speechGate.js</code>) to check if an audio segment contains actual speech:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>
          <strong>Modulation Contrast:</strong> The gate calculates the ratio between the 95th percentile RMS level (loud) and the 20th percentile level (quiet) to filter out steady room noise.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Zero-Crossing Rate (ZCR):</strong> Checks that the crossings-per-sample ratio falls within the speech range (<code>0.01 - 0.40</code>) to reject transients and high-frequency noise.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Adaptive Threshold:</strong> Calculates an adaptive frame threshold using the midpoint of the segment's quiet and loud levels.
        </li>
      </ul>


      {/* ── 6.14 BARGE-IN / INTERRUPTION HANDLING ────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.14 Barge-In / Interruption Handling</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        If the caller starts speaking during agent playback, the speech gate detects the voice activity, sends a clear command to the pacer to discard remaining audio chunks, and stops the current TTS generation.
      </p>


      {/* ── 6.15 SPEECH-TO-TEXT PIPELINE ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.15 Speech-to-Text Pipeline</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The bridge routes incoming audio streams to the STT provider. Deepgram processes the audio frames and returns real-time transcript events.
      </p>


      {/* ── 6.16 STT SESSION LIFECYCLE ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.16 STT Session Lifecycle</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The STT adapter opens a WebSocket connection to the transcription API. If the connection fails or drops, the system logs the event and falls back to batch processing modes to prevent call failure.
      </p>


      {/* ── 6.17 LLM CONVERSATION PIPELINE ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.17 LLM Conversation Pipeline</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When the STT engine returns a final transcript, the bridge appends the user query to the chat history, constructs the system instructions, and dispatches the request to the configured LLM provider.
      </p>


      {/* ── 6.18 PROMPT / CONTEXT CONSTRUCTION ───────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.18 Prompt / Context Construction</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The conversation prompt is constructed dynamically. It combines the system prompt, caller variables, and matching context blocks retrieved from knowledge base vectors.
      </p>


      {/* ── 6.19 STREAMING LLM RESPONSES ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.19 Streaming LLM Responses</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The LLM service requests a streamed response, processing token chunks as they arrive. If the user interrupts, the service cancels the active stream.
      </p>


      {/* ── 6.20 SENTENCE BUFFERING ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.20 Sentence Buffering</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The sentence buffer (<code>backend/src/services/voice/sentenceBuffer.js</code>) groups incoming LLM tokens. It splits the token stream into sentences using punctuation marks (such as <code>.</code>, <code>?</code>, and <code>!</code>) before sending them to the TTS synthesizer.
      </p>


      {/* ── 6.21 TEXT-TO-SPEECH PIPELINE ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.21 Text-to-Speech Pipeline</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The TTS pipeline converts buffered text sentences into audio streams. The synthesizer outputs PCM or &mu;-law audio frames and sends them to the outbound audio pacer.
      </p>


      {/* ── 6.22 TTS PROVIDER ARCHITECTURE ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.22 TTS Provider Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        TTS adapters (such as ElevenLabs, Cartesia, and Sarvam) stream audio chunks using custom WebSockets or chunked HTTP requests.
      </p>


      {/* ── 6.23 AUDIO PLAYBACK PIPELINE ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.23 Audio Playback Pipeline</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Synthesized audio is converted to G.711 &mu;-law formatting and enqueued in the outbound pacer. The pacer streams the audio frames to the carrier WebSocket.
      </p>


      {/* ── 6.24 AUDIO PACING ────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.24 Audio Pacing</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The outbound pacer (such as <code>ulawPacer.js</code>) uses <code>setInterval</code> loops to write audio frames in 20ms segments. This matches the real-time sample rates of telephony carriers, preventing audio lag and connection timing issues.
      </p>


      {/* ── 6.25 TURN-TAKING STATE ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.25 Turn-Taking State</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The bridge manages turn-taking states (such as <code>caller_speaking</code>, <code>ai_speaking</code>, and <code>silence</code>) to coordinate audio processing, interruption handling, and transcription events.
      </p>


      {/* ── 6.26 CONVERSATION STATE ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.26 Conversation State</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The active conversation state is kept in memory. The state tracks current call parameters and conversation history, committing details to the database when the call completes.
      </p>


      {/* ── 6.27 PROVIDER ABSTRACTION ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.27 Provider Abstraction</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system use factories (such as <code>ttsStreamFactory.js</code>) to decouple the audio bridge handlers from specific provider APIs.
      </p>


      {/* ── 6.28 TWILIO MEDIA STREAMS ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.28 Twilio Media Streams</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The Twilio media stream bridge parses <code>start</code> payloads to retrieve active stream identifiers (<code>streamSid</code>) and routes incoming G.711 &mu;-law audio packets to the conversation pipeline.
      </p>


      {/* ── 6.29 PLIVO MEDIA STREAMS ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.29 Plivo Media Streams</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The Plivo media stream bridge functions similarly to the Twilio bridge. It uses Plivo XML commands to route outbound audio to WebSocket streams on port <code>4300</code>.
      </p>


      {/* ── 6.30 BROWSER / WEB CALL STREAMING ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.30 Browser / Web Call Streaming</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Browser calls connect directly to <code>modularWebCallWss</code>. The handler decodes incoming PCM audio frames and sends output audio directly to the browser client.
      </p>


      {/* ── 6.31 XAI / REALTIME ENGINE ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.31 xAI / Realtime Engine</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Bundled engines (such as xAI and ElevenLabs sessions) use integrated, low-latency APIs that handle STT, LLM, and TTS processing in a single session, bypassing the modular pipeline.
      </p>


      {/* ── 6.32 ERROR HANDLING ──────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.32 Error Handling</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The bridge implements error boundaries. If an external API connection fails, the system logs the event and attempts to use the configured fallback provider.
      </p>


      {/* ── 6.33 DISCONNECT HANDLING ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.33 Disconnect Handling</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When the call connection closes, the bridge cleans up active handles, shuts down running voice pacer timers, and triggers the call finalizer.
      </p>


      {/* ── 6.34 CALL FINALIZATION ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.34 Call Finalization</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The call finalizer is defined in <code>backend/src/ws/callFinalizer.js</code>. The finalizer runs when the WebSocket disconnects, saving transcripts and calculating call costs.
      </p>


      {/* ── 6.35 TRANSCRIPT PERSISTENCE ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.35 Transcript Persistence</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The finalizer saves the completed conversation transcript to the <code>CallLog</code> database table, mapping the records to the workspace ID.
      </p>


      {/* ── 6.36 BILLING / WALLET FINALIZATION ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.36 Billing / Wallet Finalization</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The finalizer calculates the total call duration in seconds, determines the usage charge, and calls <code>applyWalletTransaction</code> in <code>billing.service.js</code> to deduct credits from the workspace wallet.
      </p>


      {/* ── 6.37 RECORDING HANDLING ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.37 Recording Handling</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        If recording is enabled, the finalizer flushes the recorded audio file to disk, updates the call log metadata, and saves the file URL to database tables.
      </p>


      {/* ── 6.38 REAL-TIME DATA FLOW ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.38 Real-Time Data Flow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Data flows from the client to the Express server using HTTPS requests. Audio packets are routed through WebSockets to minimize transmission latency.
      </p>


      {/* ── 6.39 COMPLETE CALL SEQUENCE ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.39 Complete Call Sequence</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Outbound calls follow this sequence: A campaign job triggers the dialer &rarr; The carrier answers and requests TwiML/XML &rarr; Connection upgrades to a WebSocket media stream &rarr; Active call exchange begins &rarr; Session disconnect triggers the call finalizer to save records.
      </p>


      {/* ── 6.40 PERFORMANCE & LATENCY CONSIDERATIONS ────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.40 Performance &amp; Latency Considerations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <em>No repository benchmark was verified.</em> To reduce connection latency, the server uses non-blocking speech gates, offloads document parsing to worker threads, and disables Nginx proxy buffering.
      </p>


      {/* ── 6.41 REAL-TIME FAILURE MODES ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.41 Real-Time Failure Modes</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Detection</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Recovery Mechanism</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>STT Connection Drop</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>WebSocket error event</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>The system falls back to batch processing mode.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>TTS Synthesis Timeout</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Timeout check triggers</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Logs the error and plays the fallback voice audio.</td>
          </tr>
        </tbody>
      </table>


      {/* ── 6.42 DEBUGGING WEBSOCKET CALLS ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.42 Debugging WebSocket Calls</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To debug calls: Verify the HTTP 101 handshake succeeds &rarr; Inspect raw binary audio payloads &rarr; Check speech gate analysis logs &rarr; Check STT transcription events and LLM completion output.
      </p>


      {/* ── 6.43 TESTING REAL-TIME COMPONENTS ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.43 Testing Real-Time Components</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Real-time pacer and VAD behavior can be verified by running the unit tests:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`# Run audio pacer & speech gate tests
npm run test:voice

# Run WebSocket stream bridge tests
npm run test:ws`}
        </code>
      </pre>


      {/* ── 6.44 ADDING A NEW WEBSOCKET PROVIDER ─────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.44 Adding a New WebSocket Provider</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add a provider, define the upgrade regex in <code>server.js</code>, register a new WebSocketServer instance, and implement a dedicated connection handler.
      </p>


      {/* ── 6.45 ADDING A NEW STT PROVIDER ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.45 Adding a New STT Provider</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add an STT provider, implement the streaming audio interface, handle API connection handshakes, and route transcription events to the conversation pipeline.
      </p>


      {/* ── 6.46 ADDING A NEW TTS PROVIDER ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.46 Adding a New TTS Provider</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add a TTS provider, implement the streaming interface, register the provider in <code>ttsStreamFactory.js</code>, and map the configuration settings to the database.
      </p>


      {/* ── 6.47 ADDING A NEW REAL-TIME ENGINE ───────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.47 Adding a New Real-Time Engine</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add an engine, implement the session interface (connect, close, send audio, handle output) and register the engine inside <code>realtimeEngine.factory.js</code>.
      </p>


      {/* ── 6.48 ENGINEERING REFERENCE ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.48 Engineering Reference</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Component</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Role</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source File</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Twilio Media Handler</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Twilio WebSocket bridge</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/ws/twilioMediaRealtime.handler.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Plivo Media Handler</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Plivo WebSocket bridge</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/ws/plivoMediaRealtime.handler.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Modular Media Bridge</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Coordinates modular audio streams</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/ws/modularMediaBridge.js`</td>
          </tr>
        </tbody>
      </table>


      {/* ── 6.49 TROUBLESHOOTING MATRIX ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>6.49 Troubleshooting Matrix</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Symptom</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Likely Cause</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Resolution</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Handshake fails with 404</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Incorrect upgrade path parameters or mismatched path</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Check path parameters and verify the upgrade path regex.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Caller hears broken audio</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Mismatched audio pacing settings or connection lag</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Ensure the pacer frame size is configured correctly.</td>
          </tr>
        </tbody>
      </table>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/queues-workers" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Queues &amp; Workers
        </Link>
        <Link to="/docs/developer/frontend" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Frontend →
        </Link>
      </div>
    </div>
  );
}
