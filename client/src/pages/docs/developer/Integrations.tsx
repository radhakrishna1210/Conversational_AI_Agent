import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevIntegrations() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>10. Integrations</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        This page details Spandan's integration adapters, provider registries, API credentials handling, and third-party webhook verification routines.
      </p>

      {/* ── 10.1 INTEGRATION ARCHITECTURE ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.1 Integration Architecture &amp; Adapter Pattern</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan decouples core business logic from specific vendor implementations using a unified provider adapter architecture:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
    Service[Spandan Domain Service] --> Factory[Provider Factory / Resolver Resolver]
    Factory --> Adapter[Provider Adapter Interface]
    Adapter --> VendorAPI[Third-Party Vendor API]
    VendorAPI --> Response[Vendor API Response]
    Response --> Adapter
    Adapter --> Service`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This diagram illustrates Spandan's factory adapter design pattern. Domain services request providers through factory resolvers (e.g. `llm.factory.js`, `ttsStreamFactory.js`, `telephony/index.js`), which instantiate concrete provider adapters that wrap third-party APIs while maintaining consistent internal interfaces.
      </p>

      {/* ── 10.2 CATEGORY-SPECIFIC INTEGRATION FLOWS ───────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.2 Category-Specific Integration Flows</h2>
      
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>A. Telephony Integration Flow</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`sequenceDiagram
  autonumber
  participant Spandan as Spandan (telephony/index.js)
  participant Adapter as Provider Adapter (twilio/plivo/piopiy)
  participant Carrier as Telephony Provider API
  participant Phone as Recipient PSTN Phone
  participant WS as modularMediaBridge.js

  Spandan->>Adapter: resolveProvider(phone) & initiateCall()
  Adapter->>Carrier: POST /Calls (REST Outbound Request)
  Carrier->>Phone: Dial PSTN Line & Ring Recipient
  Phone-->>Carrier: Recipient Answers Call
  Carrier->>WS: Upgrade Connection to WebSocket Media Stream`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This sequence diagram tracks outbound telephony initiation. `telephony/index.js` resolves the target provider adapter (Twilio, Plivo, or Piopiy) based on routing rules, places an outbound call via REST, and receives a WebSocket media stream upgrade when the customer answers.
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>B. LLM Integration Flow</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`sequenceDiagram
  autonumber
  participant Runtime as Agent Runtime (modularMediaBridge.js)
  participant Factory as LLM Factory (llm.factory.js)
  participant Provider as LLM Provider (OpenAI/Gemini/Azure/Groq)
  participant Buffer as sentenceBuffer.js

  Runtime->>Factory: getLLMProviderWithFallback(config)
  Factory-->>Runtime: Return Resolved Provider Instance
  Runtime->>Provider: Send Prompt Context & Chat History
  Provider-->>Buffer: Stream Word Tokens via Server-Sent Events
  Buffer-->>Runtime: Emit Complete Punctuated Sentence`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This sequence maps LLM completion processing. The agent runtime requests a provider from `llm.factory.js` (with automatic fallback handling), transmits prompt context, and streams text tokens into `sentenceBuffer.js` for sentence-boundary formatting.
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>C. STT (Speech-to-Text) Integration Flow</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
    Audio[Carrier PCM / g711_ulaw Audio Chunks] --> Gate[speechGate.js VAD Filter]
    Gate --> Adapter[stt.service.js STT Adapter]
    Adapter --> Provider[Deepgram WebSocket STT Engine]
    Provider --> Transcript[Final Speech Transcript Text]
    Transcript --> LLM[LLM Prompt Context]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This flow diagram depicts speech transcription. Raw audio chunks are filtered for speech activity by `speechGate.js`, forwarded through `stt.service.js` over a persistent WebSocket to Deepgram STT, and converted into final transcript text for LLM processing.
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>D. TTS (Text-to-Speech) Integration Flow</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
    Text[Sentence Text from sentenceBuffer.js] --> Factory[ttsStreamFactory.js Factory]
    Factory --> Provider[TTS Provider: ElevenLabs / Cartesia / Sarvam]
    Provider --> AudioChunks[Synthesized Binary Audio Chunks]
    AudioChunks --> Pacer[ulawPacer.js / pcmStreamPacer.js]
    Pacer --> Telephony[Telephony WebSocket Media Bridge]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This diagram maps speech synthesis. Punctuated text from `sentenceBuffer.js` is sent through `ttsStreamFactory.js` to streaming TTS providers (ElevenLabs, Cartesia, or Sarvam), producing raw audio chunks that are paced into 20ms frames and transmitted back to telephony streams.
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>E. Payment Integration Flow</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`sequenceDiagram
  autonumber
  actor User as React Dashboard User
  participant API as billing.controller.js
  participant Razorpay as Razorpay API / Checkout
  participant Webhook as billing.controller.js Webhook Handler
  participant Service as wallet.service.js
  participant DB as PostgreSQL Database

  User->>API: POST /billing/create-order (amount)
  API->>Razorpay: Create Razorpay Payment Order
  Razorpay-->>User: Return Order ID & Render Checkout UI
  User->>Razorpay: Complete Payment Transaction
  Razorpay->>Webhook: POST /webhooks/razorpay (HMAC Signature)
  Webhook->>Service: Verify Signature & applyWalletTransaction()
  Service->>DB: Record PaymentOrder & Credit Wallet Balance`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This sequence diagram tracks payment processing. Users initiate wallet top-ups through `billing.controller.js`, checkout via Razorpay, and trigger asynchronous HMAC-verified webhooks that invoke `wallet.service.js` to credit wallet balances in PostgreSQL atomically.
      </p>

      {/* ── 10.3 PROVIDER ABSTRACTION MODEL ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.3 Provider Abstraction Model</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Engine components run under dynamic factories to decouple routing from specific providers:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>
          <strong>LLM Factory:</strong> <code>getLLMProviderWithFallback</code> (in [`backend/src/services/llm.factory.js`](file:///backend/src/services/llm.factory.js)) dynamically resolves client instances with fallback overrides.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Real-Time Session Factory:</strong> <code>createRealtimeSession</code> (in [`backend/src/services/voice/realtimeEngine.factory.js`](file:///backend/src/services/voice/realtimeEngine.factory.js)) instantiates Grok (xAI) or ElevenLabs sessions sharing a common interface.
        </li>
      </ul>


      {/* ── 10.4 INTEGRATION MATRIX ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.4 Integration Matrix</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Provider</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Category</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Adapter File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Factory Resolver</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Auth Type</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Used By</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure Behaviour</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Twilio</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Telephony</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`twilio.provider.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`telephony/index.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Basic Auth SID</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign Dispatch</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Logs error, sets recipient status failed</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Plivo</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Telephony</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`plivo.provider.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`telephony/index.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Auth ID / Token</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Indian Routes / Campaigns</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Logs error, sets recipient status failed</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Gemini</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>LLM API</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`gemini.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`llm.factory.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>API Key</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Voice Media Bridge</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Fallback to OpenAI automatically</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>OpenAI</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>LLM API</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`openai.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`llm.factory.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>API Key</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Voice Bridge / Embeddings</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Fallback to Mock LLM / Fail turn</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>ElevenLabs</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>TTS Stream</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`elevenlabs.provider.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`ttsStreamFactory.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>API Key</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Voice Engine Synthesis</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Speech generation halts / returns warning</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>HubSpot</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>CRM Syncer</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`integrations.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Integration Router</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>OAuth Token</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Post-Call Syncer</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Logs synchronization retry error</td>
          </tr>
        </tbody>
      </table>

      {/* ── 10.5 ENVIRONMENT VARIABLE MAPPING ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.5 Environment Variable Mappings</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Provider</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Environment Variables</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source File Location</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Twilio Telephony</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/src/services/telephony/twilio.provider.js`](file:///backend/src/services/telephony/twilio.provider.js)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Plivo Telephony</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/src/services/telephony/plivo.provider.js`](file:///backend/src/services/telephony/plivo.provider.js)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Deepgram STT</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`DEEPGRAM_API_KEY`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/src/services/stt/deepgramStream.service.js`](file:///backend/src/services/stt/deepgramStream.service.js)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>ElevenLabs TTS</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`ELEVENLABS_API_KEY`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/src/services/voice/providers/elevenlabs.provider.js`](file:///backend/src/services/voice/providers/elevenlabs.provider.js)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Gemini LLM</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`GEMINI_API_KEY`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/src/services/llm/gemini.service.js`](file:///backend/src/services/llm/gemini.service.js)</td>
          </tr>
        </tbody>
      </table>

      {/* ── 10.6 TELEPHONY INTEGRATIONS ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.6 Telephony Integrations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Telephony integrations process inbound and outbound audio streams. Inbound streams establish a media bridge WebSocket connection, upgrade the protocol, and route real-time G.711 &mu;-law audio packets to the conversation pipeline.
      </p>

      {/* ── 10.7 TWILIO ───────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.7 Twilio</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Twilio integration is defined in [`backend/src/services/telephony/twilio.provider.js`](file:///backend/src/services/telephony/twilio.provider.js). It initializes outgoing calls using Twilio's REST API and connects active calls to the WebSocket bridge using custom TwiML Streams pointing to `/api/v1/twilio-media/`.
      </p>

      {/* ── 10.8 PLIVO ────────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.8 Plivo</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Plivo integration is defined in [`backend/src/services/telephony/plivo.provider.js`](file:///backend/src/services/telephony/plivo.provider.js). The connection uses Plivo XML commands to route outbound audio to WebSocket streams on port `4300`.
      </p>

      {/* ── 10.9 PIOPIY ───────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.9 Piopiy</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Piopiy is implemented in [`backend/src/services/telephony/piopiy.provider.js`](file:///backend/src/services/telephony/piopiy.provider.js). It initiates calls via Piopiy APIs and relies on webhook CDR (Call Detail Record) payloads to resolve status details.
      </p>

      {/* ── 10.10 LLM INTEGRATIONS ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.10 LLM Integrations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The LLM abstraction formats agent prompt contexts, system variables, and knowledge grounding inputs before dispatching requests to completion models.
      </p>

      {/* ── 10.11 OPENAI ───────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.11 OpenAI</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        OpenAI model integration is configured in [`backend/src/services/llm/openai.service.js`](file:///backend/src/services/llm/openai.service.js) using the official `openai` SDK. Connection credentials require the `OPENAI_API_KEY` variable.
      </p>

      {/* ── 10.12 AZURE OPENAI ────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.12 Azure OpenAI</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Azure OpenAI integration is implemented in [`backend/src/services/llm/azure.service.js`](file:///backend/src/services/llm/azure.service.js) using `@azure/openai`, supporting enterprise deployment endpoints.
      </p>

      {/* ── 10.13 GEMINI ──────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.13 Gemini</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Gemini is implemented in [`backend/src/services/llm/gemini.service.js`](file:///backend/src/services/llm/gemini.service.js) using the `@google/generative-ai` SDK, supporting grounding parameters and system rules.
      </p>

      {/* ── 10.14 SPEECH-TO-TEXT INTEGRATIONS ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.14 Speech-to-Text Integrations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Speech-to-Text adapters stream raw binary audio to transcription models. Results are returned as partial transcripts or final sentences to trigger conversational completions.
      </p>

      {/* ── 10.15 DEEPGRAM ────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.15 Deepgram</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Deepgram streaming is implemented in [`backend/src/services/stt/deepgramStream.service.js`](file:///backend/src/services/stt/deepgramStream.service.js). It opens a WebSocket connection to the Deepgram API and streams raw G.711 or PCM audio to receive real-time transcripts.
      </p>

      {/* ── 10.16 TEXT-TO-SPEECH INTEGRATIONS ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.16 Text-to-Speech Integrations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Text-to-Speech engines synthesize chat completions into audio streams, buffering sentence segments before sending them to the telephony client.
      </p>

      {/* ── 10.17 ELEVENLABS ──────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.17 ElevenLabs</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        ElevenLabs is implemented in [`backend/src/services/voice/providers/elevenlabs.provider.js`](file:///backend/src/services/voice/providers/elevenlabs.provider.js). The adapter supports text-to-speech synthesis and voice cloning parameters.
      </p>

      {/* ── 10.18 CARTESIA ────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.18 Cartesia</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Cartesia is implemented in [`backend/src/services/voice/providers/cartesia.provider.js`](file:///backend/src/services/voice/providers/cartesia.provider.js). It streams audio chunks using Cartesia's WebSockets API to reduce connection overhead.
      </p>

      {/* ── 10.19 FISH AUDIO ──────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.19 Fish Audio</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Fish Audio is implemented in [`backend/src/services/voice/providers/fishaudio.provider.js`](file:///backend/src/services/voice/providers/fishaudio.provider.js), supporting custom voice configurations.
      </p>

      {/* ── 10.20 SARVAM ──────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.20 Sarvam</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Sarvam integration is implemented in [`backend/src/services/voice/providers/sarvam.provider.js`](file:///backend/src/services/voice/providers/sarvam.provider.js). The adapter supports multilingual and regional Indian voice models.
      </p>

      {/* ── 10.21 REALTIME VOICE PROVIDERS ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.21 Realtime Voice Providers</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Conversational sessions leverage bidirectional WebSockets to stream audio and handle user barge-in and interruptions dynamically:
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Provider</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Streaming Protocol</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Audio Format</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Interruption / Barge-in</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>xAI (Grok)</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Bidirectional WebSockets</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>PCM 16kHz / u-law</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes (barge_in RMS detection)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>ElevenLabs Realtime</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Bidirectional WebSockets</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>PCM 8kHz / u-law</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes (SpeechGate RMS check)</td>
          </tr>
        </tbody>
      </table>

      {/* ── 10.22 CALENDAR INTEGRATIONS ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.22 Calendar Integrations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Calendar integrations allow voice agents to check availability and book appointments dynamically.
      </p>

      {/* ── 10.23 GOOGLE CALENDAR ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.23 Google Calendar</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Google Calendar is implemented in [`backend/src/services/googleCalendar.service.js`](file:///backend/src/services/googleCalendar.service.js). The service uses OAuth tokens to retrieve availability and schedule calendar events.
      </p>

      {/* ── 10.24 CAL.COM ────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.24 Cal.com</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Cal.com is integrated via standard API calls using the credentials verified during connection setup.
      </p>

      {/* ── 10.25 CRM INTEGRATIONS ────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.25 CRM Integrations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        CRM integrations allow workspaces to sync leads, contacts, and call outcome logs.
      </p>

      {/* ── 10.26 HUBSPOT ────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.26 HubSpot</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        HubSpot is implemented in [`backend/src/services/integrations.service.js`](file:///backend/src/services/integrations.service.js). The service connects to HubSpot CRM contacts using bearer token authentication.
      </p>

      {/* ── 10.27 SALESFORCE ──────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.27 Salesforce</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Salesforce is integrated by checking deployment limit constraints using OAuth access tokens.
      </p>

      {/* ── 10.28 GOOGLE SHEETS ───────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.28 Google Sheets</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Google Sheets integration is implemented in [`backend/src/services/googleSheets.service.js`](file:///backend/src/services/googleSheets.service.js). It uses OAuth credentials to parse and update spreadsheets with post-call metadata.
      </p>

      {/* ── 10.29 WHATSAPP (REMOVED) ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.29 WhatsApp (Cleaned Migration Status)</h2>
      <DocsCallout type="note" title="WHATSAPP ARCHITECTURAL REMOVAL">
        WhatsApp templates and related database models were completely removed from the active schemas during migration cleanups to prevent system errors. Outbound channels support voice calls.
      </DocsCallout>

      {/* ── 10.30 SLACK ───────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.30 Slack</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Slack notifications are sent using the team's bot token. The integration validates connection credentials using Slack's <code>auth.test</code> API.
      </p>

      {/* ── 10.31 WEBHOOK INTEGRATIONS ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.31 Webhook Integrations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Outgoing webhooks send data payloads to third-party automation systems (such as Make, Zapier, n8n, and GoHighLevel) when workspace events occur.
      </p>

      {/* ── 10.32 INTEGRATION SECURITY & CREDENTIALS ──────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.32 Credentials &amp; Secret Handling</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Third-party credentials utilize secure storage vectors:
      </p>

      <DocsCallout type="security" title="CREDENTIAL STORAGE AND WEBHOOK ENCRYPTION">
        Never hardcode API keys or secret tokens into codebase repositories. Environment credentials must load from `.env` or system variables, while workspace-level OAuth refresh/access tokens are stored inside the database and encrypted at-rest using AES-256-GCM configurations.
      </DocsCallout>

      {/* ── 10.33 PROVIDER SELECTION & FALLBACKS ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.33 Provider Selection &amp; Fallbacks</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Fallback mechanisms redirect operations to active providers if a service fails. For example, if a primary LLM is unavailable or its API key is missing, the system falls back to Gemini, then OpenAI, and finally a mock LLM service:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`// Fallback hierarchy in llm.factory.js
if (process.env.GEMINI_API_KEY) return geminiService;
if (process.env.OPENAI_API_KEY) return openaiService;
return mockLLMService;`}
        </code>
      </pre>

      {/* ── 10.34 ERROR HANDLING & RETRIES ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>10.34 Error Handling &amp; Retries</h2>
      <DocsCallout type="failure" title="THIRD-PARTY SERVICE TIMEOUTS">
        When an external API call times out or returns HTTP 5xx errors, adapters throw standardized wrapper exceptions. Retries are managed for non-idempotent operations where safe, and webhook status is updated to `FAILED` with details logged.
      </DocsCallout>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/infrastructure" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Infrastructure
        </Link>
        <Link to="/docs/developer/dev-workflow" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Workflow →
        </Link>
      </div>
    </div>
  );
}
