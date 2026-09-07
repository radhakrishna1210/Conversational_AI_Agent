import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevOverview() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>Developer Documentation: Overview</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        A comprehensive, technical engineering onboarding guide for Spandan—detailing system architecture, runtime data flows, codebase navigation, environment configurations, and operational constraints.
      </p>

      <DocsCallout type="note" title="DEVELOPER ACCESS CONTROL">
        Developer documentation is restricted to users with the Superadmin role. To view these docs in the UI, ensure your registered user email matches the `SUPER_ADMIN_EMAIL` environment variable.
      </DocsCallout>

      {/* ── 1. WHAT IS SPANDAN? ───────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. What is Spandan?</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan is an enterprise-grade, multi-tenant Conversational AI voice engine engineered to orchestrate low-latency outbound outreach campaigns and bi-directional real-time voice call automation. The platform replaces traditional legacy IVRs with fluid, human-like AI voice agents capable of sub-second speech turn-taking.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 28 }}>
        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Backend API Layer</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Node.js (ESM) Express application handling REST authentication, multi-tenant workspace isolation, Zod input validation, database transaction ledgers, and third-party webhooks.
          </p>
        </div>
        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Real-Time Voice Subsystem</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Dedicated WebSocket media streams bridge accepting PSTN/VoIP carrier audio (Twilio/Plivo), streaming live audio to Deepgram STT, passing conversational context to LLMs, and pacing TTS speech audio.
          </p>
        </div>
        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Asynchronous Processing</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            BullMQ queues running on Redis for bulk outbound calling dispatch (`campaign-dispatch`) alongside Node Worker Threads (`kbExtract.worker.js`) for CPU-bound document text extraction.
          </p>
        </div>
        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Frontend Dashboard SPA</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Single-Page Application built with React 18, TypeScript, and Vite—providing real-time call analytics, agent prompt builders, campaign setup tools, and dynamic documentation.
          </p>
        </div>
      </div>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Spandan[Spandan Platform Overview]
  Spandan --> FE["Frontend (React 18 SPA / Vite / TypeScript)"]
  Spandan --> BE["Backend API (Express / Node.js :4000)"]
  Spandan --> DB["Database (PostgreSQL / Prisma ORM / PgBouncer)"]
  Spandan --> QW["Queues & Workers (BullMQ / Redis / Worker Threads)"]
  Spandan --> RTV["Real-Time Voice (WebSocket Media Bridge)"]
  Spandan --> INT["Integrations (Telephony / LLM / STT / TTS / Razorpay)"]
  Spandan --> INF["Infrastructure (Nginx Proxy / PM2 / Linux VPS)"]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This conceptual overview diagram highlights Spandan's 7 core subsystems: Frontend client, Backend API server, PostgreSQL/Prisma Database layer, BullMQ Queues and Worker threads, Real-Time Voice Pipeline, Third-Party Integrations, and Production Infrastructure.
      </p>

      {/* ── 2. SYSTEM RESPONSIBILITIES ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. System Responsibilities</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Responsibility</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Description</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Main Components</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Important Source Locations</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Authentication</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Bcrypt password validation, Google OAuth logins, and JWT token pairs (access + refresh token rotation).</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Auth Controller &amp; Middleware</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/controllers/auth.controller.js`, `backend/src/middleware/authenticate.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Workspace Tenant Isolation</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Scopes database queries, agents, call logs, and API keys by workspace membership context.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Workspace Context Middleware</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/middleware/workspaceContext.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Voice Agents</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Defines system prompts, temperature, speech speeds, voice IDs, and webhook triggers.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Agent Controller &amp; Service</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/controllers/agent.controller.js`, `backend/src/services/agent.service.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Outbound Campaigns</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Schedules, throttles, and dispatches bulk phone calls via background BullMQ queues.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Campaign Queue &amp; Worker</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/queues/campaign.queue.js`, `backend/src/workers/campaign.worker.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Real-Time Calls &amp; STT/LLM/TTS</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Bi-directional streaming media bridge, audio frame pacing, VAD speech gating, and synthesis.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Modular Media Bridge</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/ws/modularMediaBridge.js`, `backend/src/services/voice/`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Knowledge Base (RAG)</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>PDF/CSV text extraction via worker threads, text chunking, and PostgreSQL pgvector embeddings.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>KB Chunking Service &amp; Worker</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/kbChunking.service.js`, `backend/src/workers/kbExtract.worker.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Billing &amp; Wallet Ledger</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Calculates call duration charges and applies atomic, idempotent wallet transaction entries.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Billing Service &amp; Call Finalizer</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/billing/billing.service.js`, `backend/src/ws/callFinalizer.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Webhooks</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Receives Razorpay payment webhooks and Meta WhatsApp callbacks using raw HMAC signatures.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>App Raw Body Parsers</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/app.js`, `backend/src/controllers/billing.controller.js`</td>
          </tr>
        </tbody>
      </table>

      {/* ── 3. HIGH-LEVEL SYSTEM COMPONENTS ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3. High-Level System Components</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>React / Vite Client</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Purpose:</strong> Web frontend dashboard SPA for administrative configuration and analytics.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Runtime:</strong> Browser environment compiled via Vite 5.2.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Dependencies:</strong> React 18, React Router DOM v6, TailwindCSS, Lucide React, Radix UI primitives.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Communication Method:</strong> REST HTTP requests (`authFetch.ts`, `whapi.ts`) and Server-Sent Events (`sseClient.ts`).</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Source Location:</strong> `client/src/`</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}><strong>Failure Impact:</strong> Users cannot access the web dashboard UI; backend and live voice calls remain unaffected.</p>
        </div>

        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Express HTTP Server</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Purpose:</strong> Main application entrypoint serving REST routes, authentication, and security headers.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Runtime:</strong> Node.js (v20+) process running `src/server.js` on port `4000`.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Dependencies:</strong> Express v4.19, Helmet v7.1, CORS, Zod v3.23, Pino logger.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Communication Method:</strong> Standard HTTP REST requests and JSON responses.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Source Location:</strong> `backend/src/app.js`, `backend/src/server.js`</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}><strong>Failure Impact:</strong> System becomes completely unavailable to web users and REST API consumers.</p>
        </div>

        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>WebSocket Server Gateways</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Purpose:</strong> Handles real-time audio media streams for web browser calls and carrier VoIP trunks.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Runtime:</strong> Attaches `ws` instance listeners directly to the main Express HTTP server.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Dependencies:</strong> ws v8.21, Deepgram SDK, OpenAI / Gemini / ElevenLabs / Cartesia adapters.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Communication Method:</strong> Bi-directional WebSocket binary frames (PCM / g711_ulaw) and JSON control events.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Source Location:</strong> `backend/src/ws/`</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}><strong>Failure Impact:</strong> Active voice calls drop and new voice call attempts fail.</p>
        </div>

        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>PostgreSQL &amp; Prisma ORM</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Purpose:</strong> Primary relational database storing user accounts, workspaces, agents, call logs, wallets, and vector embeddings.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Runtime:</strong> PostgreSQL 14+ database instance connected via Supabase PgBouncer pooler (`:6543`).</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Dependencies:</strong> `@prisma/client` v5.14, `pg` driver.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Source Location:</strong> `backend/prisma/schema.prisma`, `backend/src/config/prisma.js`</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}><strong>Failure Impact:</strong> REST endpoints fail with database errors; active in-flight calls log local fallback metrics.</p>
        </div>

        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Redis &amp; BullMQ Workers</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Purpose:</strong> In-memory key-value cache and job queue store backing background campaign dispatching.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Runtime:</strong> Redis server connected via `ioredis` v5.3.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Dependencies:</strong> `bullmq` v5.7, `ioredis` v5.3.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Source Location:</strong> `backend/src/config/redis.js`, `backend/src/queues/`, `backend/src/workers/`</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}><strong>Failure Impact:</strong> Outbound campaign scheduling fails; interactive web voice calls continue operating.</p>
        </div>
      </div>

      {/* ── 4. RUNTIME ARCHITECTURE & TOPOLOGY ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>4. Runtime Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When the backend starts via <code>node --env-file=.env src/server.js</code>, the following initialization sequence occurs:
      </p>
      <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}><strong>DB Connectivity Check:</strong> Queries PostgreSQL table presence (<code>SELECT 1 FROM "Agent"</code>). If missing, logs error: "DATABASE SCHEMA IS NOT MIGRATED".</li>
        <li style={{ marginBottom: 8 }}><strong>Worker Connection:</strong> Instantiates `campaignWorker` inside `src/workers/campaign.worker.js`.</li>
        <li style={{ marginBottom: 8 }}><strong>Scheduler Initialization:</strong> Starts startup sweeps for `integrationScheduler`, `voiceSyncScheduler`, `recordingRetention`, `resumeStuckKbJobs`, and `renewDueSubscriptions`.</li>
        <li style={{ marginBottom: 8 }}><strong>WebSocket Upgrade Handlers:</strong> Attaches 4 WebSocket listener paths (`webCallWss`, `modularWebCallWss`, `twilioMediaWss`, `plivoMediaWss`) to the Express server.</li>
        <li style={{ marginBottom: 8 }}><strong>HTTP Listener:</strong> Binds the Express server to `PORT` (default: `4000`).</li>
      </ol>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Server[src/server.js Startup] --> DBCheck{Check PostgreSQL}
  DBCheck -->|Pass| ExpressApp[Express App src/app.js]
  ExpressApp --> Routes[/api/v1 Routes]
  ExpressApp --> StaticSPA[Serve Client Build dist/]
  Server --> WSAttach[Attach ws Upgrade Listeners]
  WSAttach --> Path1[/xai-call]
  WSAttach --> Path2[/web-call]
  WSAttach --> Path3[/twilio-media]
  WSAttach --> Path4[/plivo-media]
  Server --> WorkerInit[Start BullMQ campaign.worker.js]
  Server --> SchedInit[Start Background Schedulers]
  SchedInit --> RetSweeper[recordingRetention 6h]
  SchedInit --> KBSweeper[resumeStuckKbJobs]
  SchedInit --> SubSweeper[renewDueSubscriptions]`}
        </pre>
      </div>

      {/* ── 5. REPOSITORY STRUCTURE ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>5. Repository Structure</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan is structured as a single monorepo split between `backend/` and `client/`:
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Backend Directory (`backend/`)</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 12 }}>
          <strong>`prisma/`:</strong> Schema models (`schema.prisma`) and seed data (`seed.js`).<br />
          <em>Belongs:</em> Relational database structure definitions and SQL seeds.<br />
          <em>Important File:</em> `prisma/schema.prisma`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`scripts/`:</strong> Deployment and setup execution scripts.<br />
          <em>Belongs:</em> Administrative scripts run during CI/CD or dev bootstrapping.<br />
          <em>Important File:</em> `scripts/prisma-migrate-deploy.js`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/config/`:</strong> Environment loaders and middleware policies.<br />
          <em>Belongs:</em> Configuration sanity validators (`env.js`), CSP rules (`csp.js`), and DB clients (`prisma.js`, `redis.js`).<br />
          <em>Important File:</em> `src/config/env.js`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/constants/`:</strong> Global pricing models, system limits, and role definitions.<br />
          <em>Belongs:</em> Static platform constants.<br />
          <em>Important File:</em> `src/constants/pricing.js`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/controllers/`:</strong> REST endpoint request and response controllers.<br />
          <em>Belongs:</em> Parsing `req.body`/`req.params`, calling service methods, returning JSON.<br />
          <em>Should NOT belong:</em> Direct raw database SQL or third-party SDK calls.<br />
          <em>Important Example:</em> `src/controllers/campaign.controller.js`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/lib/`:</strong> Shared backend internal utilities.<br />
          <em>Belongs:</em> Pino logger configuration (`logger.js`), password hashing (`hash.js`).<br />
          <em>Important File:</em> `src/lib/logger.js`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/middleware/`:</strong> Express route guards and request modifiers.<br />
          <em>Belongs:</em> Authentication checks (`authenticate.js`), tenant context (`workspaceContext.js`), error handling (`errorHandler.js`).<br />
          <em>Important File:</em> `src/middleware/authenticate.js`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/queues/`:</strong> BullMQ queue instance definitions.<br />
          <em>Belongs:</em> Queue triggers and job options configuration.<br />
          <em>Important File:</em> `src/queues/campaign.queue.js`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/routes/`:</strong> Express API router definitions.<br />
          <em>Belongs:</em> Mapping paths to controllers and mounting middleware.<br />
          <em>Important File:</em> `src/routes/index.js`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/services/`:</strong> Core domain business logic and third-party integrations.<br />
          <em>Belongs:</em> Wallet transactions, LLM factories, STT streams, campaign dialer runners.<br />
          <em>Important Subfolder:</em> `src/services/voice/`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/validators/`:</strong> Zod input validation schemas.<br />
          <em>Belongs:</em> Schema constraints for incoming request payloads.<br />
          <em>Important File:</em> `src/validators/campaign.validator.js`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/workers/`:</strong> Asynchronous queue workers and thread pools.<br />
          <em>Belongs:</em> BullMQ campaign consumers and Node Worker Thread text extractors.<br />
          <em>Important File:</em> `src/workers/campaign.worker.js`
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/ws/`:</strong> Real-time WebSocket connection handlers.<br />
          <em>Belongs:</em> Carrier media stream bridges, audio frame pacers, and call finalizers.<br />
          <em>Important File:</em> `src/ws/modularMediaBridge.js`
        </li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Frontend Directory (`client/`)</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/components/`:</strong> Reusable UI widgets and layout components.<br />
          <em>Belongs:</em> Buttons, modals, navigation sidebars (`Navbar.tsx`, `Sidebar.tsx`, `DocsImage.tsx`).
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/hooks/`:</strong> Custom React state hooks.<br />
          <em>Belongs:</em> Dark mode toggle (`useTheme.ts`), custom query hooks.
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/lib/`:</strong> Frontend API client transports and local storage helpers.<br />
          <em>Belongs:</em> Fetch wrappers (`authFetch.ts`, `whapi.ts`), token storage (`authStorage.ts`), SSE stream listener (`sseClient.ts`).
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/pages/`:</strong> Dashboard and application views.<br />
          <em>Belongs:</em> Route page views (`Dashboard.tsx`, `CallLogs.tsx`, `Campaigns.tsx`).
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/pages/docs/`:</strong> Integrated documentation system.<br />
          <em>Belongs:</em> TSX documentation views for User (`user/`) and Developer (`developer/`) manuals.
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/App.tsx`:</strong> Main client router mapping and layout route guards (`DeveloperDocsRoute`).
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>`src/main.tsx`:</strong> React client application DOM bootstrap entrypoint.
        </li>
      </ul>

      {/* ── 6. TECHNOLOGY STACK ───────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>6. Technology Stack</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Technology</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Verified Version</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Where Used</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Important Files</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Node.js</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>&gt;=20.0.0</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Server execution runtime (ESM).</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Backend Server &amp; Workers</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/package.json`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Express</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>^4.19.2</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>HTTP REST web server.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Backend REST API</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/app.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Prisma</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>^5.14.0</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>PostgreSQL Database ORM.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Database Layer</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/prisma/schema.prisma`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>BullMQ</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>^5.7.0</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis background job queuing.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign Queues</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/queues/campaign.queue.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>ioredis</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>^5.3.2</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis client library.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis Connection Config</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/config/redis.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>ws</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>^8.21.1</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>WebSocket server protocol.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Voice Media Streams</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/server.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>React</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>^18.2.0</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>UI Component Framework.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Frontend SPA</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`client/package.json`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Vite</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>^5.2.0</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Frontend Bundler &amp; Dev Server.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Client Build Pipeline</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`client/vite.config.ts`</td>
          </tr>
        </tbody>
      </table>

      {/* ── 7. RUNTIME DATA FLOWS ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>7. Runtime Data Flows</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>7.1 Authentication Data Flow</h3>
      <div style={{ margin: '16px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`sequenceDiagram
  actor User as React Client
  participant API as Express Auth Router
  participant Service as Auth Service
  participant DB as Prisma Database

  User->>API: POST /api/v1/auth/login { email, password }
  API->>Service: loginUser()
  Service->>DB: findUnique({ where: { email } })
  DB-->>Service: User Record (with passwordHash)
  Service->>Service: bcrypt.compare(password, passwordHash)
  Service->>DB: create(RefreshToken SHA-256)
  Service-->>API: { accessToken, refreshToken, user }
  API-->>User: 200 OK JSON Payload`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>7.2 Campaign Outreach Data Flow</h3>
      <div style={{ margin: '16px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph LR
  Client[React Dashboard] -->|POST /campaigns/:id/launch| Express[Express Campaign Controller]
  Express -->|enqueueCampaign| BullMQ[BullMQ 'campaign-dispatch']
  BullMQ -->|Redis Storage| Redis[(Redis Queue)]
  Worker[campaign.worker.js] -->|Poll Next Job| Redis
  Worker -->|runCampaign| Service[campaignRunner.service.js]
  Service -->|Place Call| Carrier[Twilio / Plivo Carriers]
  Carrier -->|WS Upgrade| MediaBridge[modularMediaBridge.js]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>7.3 Real-Time Voice Pipeline Data Flow</h3>
      <div style={{ margin: '16px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`sequenceDiagram
  participant Carrier as Telephony Carrier
  participant WS as WS Media Bridge (modularMediaBridge.js)
  participant STT as Deepgram STT
  participant LLM as OpenAI / Gemini LLM
  participant TTS as ElevenLabs / Cartesia TTS

  Carrier->>WS: (1) WS Upgrade Handshake (101)
  Carrier->>WS: (2) Stream Binary Audio Frames (uLaw/PCM)
  WS->>STT: (3) Forward Audio Chunk to STT WebSocket
  STT-->>WS: (4) Return Final Transcript Text
  WS->>LLM: (5) Stream Text Prompt to LLM
  LLM-->>WS: (6) Return Streaming Tokens to SentenceBuffer
  WS->>TTS: (7) Stream Completed Sentence to Synthesizer
  TTS-->>WS: (8) Return Synthesized Audio Bytes
  WS-->>Carrier: (9) Write Paced Audio Packets to Carrier
  Carrier->>WS: (10) Call Hangup / Disconnect
  WS->>WS: (11) Call Finalizer: Deduct Wallet & Save CallLog`}
        </pre>
      </div>

      {/* ── 8. EXTERNAL SERVICES MATRIX ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>8. External Services Matrix</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Provider</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Category</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Integration Location</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Configuration</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure Behaviour</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Twilio</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Telephony</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Places PSTN calls &amp; streams WebSocket audio.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`telephony/twilio.provider.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Call fails instantly.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Plivo</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Telephony</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Indian domestic calling carrier.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`telephony/plivo.provider.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Falls back to Twilio.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Deepgram</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>STT</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Real-time low-latency speech transcription.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`stt/deepgramStream.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Speech transcription drops.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Gemini / OpenAI</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>LLM</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Conversational AI brain &amp; prompt completions.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`services/llm.factory.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`GEMINI_API_KEY`, `OPENAI_API_KEY`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Automatic fallback (Gemini &rarr; OpenAI &rarr; Mock).</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>ElevenLabs / Cartesia</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>TTS</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>High-fidelity speech synthesis.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`voice/ttsStreamFactory.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`ELEVENLABS_API_KEY`, `CARTESIA_API_KEY`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Audio synthesis errors out.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Razorpay</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Billing</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Prepaid wallet topups &amp; webhooks.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`controllers/billing.controller.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`RAZORPAY_KEY_SECRET`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Payment captures fail signature check.</td>
          </tr>
        </tbody>
      </table>

      {/* ── 9. ENVIRONMENT MODEL ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>9. Environment Model</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Environment</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>NODE_ENV</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Backend Behaviour</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Frontend Behaviour</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Build &amp; Static Serving</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Development</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>development</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Debug logs enabled; allows dev CORS origins (`localhost:5173`).</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Vite HMR dev server running on port `5173`.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Vite serves client separately; API serves JSON only.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Test</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>test</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Native Node test runner (`npm run test:voice`, `npm run test:billing`).</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Headless mock client execution.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Executes isolated test scripts against test DB.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Production</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>production</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Strict security mode with Helmet CSP and CORS origin enforcement.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Single-origin SPA bundle served from `client/dist`.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Express serves `index.html` and assets via `express.static`.</td>
          </tr>
        </tbody>
      </table>

      {/* ── 10. LOCAL DEVELOPMENT SETUP ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>10. Local Development Setup</h2>
      <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}><strong>Prerequisites:</strong> Node.js (v20+), PostgreSQL (v14+), and Redis installed and running locally.</li>
        <li style={{ marginBottom: 8 }}><strong>Clone:</strong> <code>git clone &lt;REPO_URL&gt;</code></li>
        <li style={{ marginBottom: 8 }}><strong>Install Backend Dependencies:</strong> <code>cd backend &amp;&amp; npm install</code></li>
        <li style={{ marginBottom: 8 }}><strong>Install Frontend Dependencies:</strong> <code>cd ../client &amp;&amp; npm install</code></li>
        <li style={{ marginBottom: 8 }}><strong>Configure Environment:</strong> Create <code>backend/.env</code> with required keys (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SUPER_ADMIN_EMAIL`).</li>
        <li style={{ marginBottom: 8 }}><strong>Database &amp; Prisma Setup:</strong> Run <code>npm run predev</code> in <code>backend/</code> to generate Prisma Client and deploy migrations.</li>
        <li style={{ marginBottom: 8 }}><strong>Start Backend Server:</strong> Run <code>npm run dev</code> in <code>backend/</code> (starts Express on port `4000`).</li>
        <li style={{ marginBottom: 8 }}><strong>Start Frontend App:</strong> Run <code>npm run dev</code> in <code>client/</code> (starts Vite on port `5173`).</li>
        <li style={{ marginBottom: 8 }}><strong>Health Check Verification:</strong> Open <code>http://localhost:4000/health</code> to confirm API status.</li>
      </ol>

      {/* ── 11. COMPREHENSIVE ENVIRONMENT VARIABLES ───────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>11. Environment Variables Reference</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Variable</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Used By</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Example Format</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Sensitive</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>DATABASE_URL</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>PostgreSQL connection string.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Prisma ORM (`src/config/env.js`)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`postgresql://user:pass@host:6543/db`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`JWT_ACCESS_SECRET`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Signing secret for 15-min JWT access tokens.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Auth Service &amp; Middleware</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`&lt;LONG_RANDOM_STRING&gt;`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>JWT_REFRESH_SECRET</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Signing secret for 7-day refresh tokens.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Auth Service (`src/services/auth.service.js`)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`&lt;LONG_RANDOM_STRING&gt;`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>REDIS_URL</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis connection URL for BullMQ queues.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Redis Config (`src/config/redis.js`)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`redis://localhost:6379`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>SUPER_ADMIN_EMAIL</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Target email promoted to Superadmin status.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Auth Storage &amp; Docs Guard</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`admin@yourdomain.com`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>DEEPGRAM_API_KEY</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>API key for streaming STT transcription.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>STT Stream Service</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`&lt;DEEPGRAM_KEY_STRING&gt;`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
          </tr>
        </tbody>
      </table>

      {/* ── 12. FIRST-DAY DEVELOPER CHECKLIST ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>12. First-Day Developer Checklist</h2>
      <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}>[ ] Clone repository and run `npm install` in both `/backend` and `/client`.</li>
        <li style={{ marginBottom: 8 }}>[ ] Verify PostgreSQL and Redis are running locally.</li>
        <li style={{ marginBottom: 8 }}>[ ] Create `backend/.env` and configure `DATABASE_URL` and `SUPER_ADMIN_EMAIL`.</li>
        <li style={{ marginBottom: 8 }}>[ ] Run `npm run predev` in `backend/` to sync Prisma tables.</li>
        <li style={{ marginBottom: 8 }}>[ ] Run `npm run test:voice` in `backend/` to verify audio pacer tests.</li>
        <li style={{ marginBottom: 8 }}>[ ] Start servers: `npm run dev` in `backend/` and `client/`.</li>
        <li style={{ marginBottom: 8 }}>[ ] Open `http://localhost:4000/health` to confirm backend response.</li>
        <li style={{ marginBottom: 8 }}>[ ] Register a user at `http://localhost:5173/signup` with your `SUPER_ADMIN_EMAIL` to unlock developer docs.</li>
      </ol>

      {/* ── 13. WHERE SHOULD I LOOK? (NAVIGATION TABLE) ───────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>13. Where Should I Look?</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>If you need to change...</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Start here</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Then inspect</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Related Documentation</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Authentication &amp; JWT Rotation</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/controllers/auth.controller.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/auth.service.js`, `client/src/lib/authFetch.ts`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><Link to="/docs/developer/security">Security Docs</Link></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Outbound Call Campaigns</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/queues/campaign.queue.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/workers/campaign.worker.js`, `backend/src/services/campaignRunner.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><Link to="/docs/developer/queues-workers">Queues Docs</Link></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Real-Time Voice Streaming Bridge</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/ws/modularMediaBridge.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/voice/`, `backend/src/ws/callFinalizer.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><Link to="/docs/developer/websockets">WebSockets Docs</Link></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Database Schemas &amp; Ledgers</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/prisma/schema.prisma`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/billing/billing.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><Link to="/docs/developer/database">Database Docs</Link></td>
          </tr>
        </tbody>
      </table>

      {/* ── 14. IMPORTANT ENTRY POINTS ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>14. Important Entry Points</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Area</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Entry Point</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Responsibility</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Backend Server Entrypoint</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/server.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Bootstraps HTTP listener, DB check, WebSocket upgrade routes, and worker schedulers.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Express Application</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/app.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Configures CORS, Helmet CSP, raw body webhook parsers, and static SPA serving.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Database Models</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/prisma/schema.prisma`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Defines core PostgreSQL tables, foreign key relations, and indexes.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Frontend Router</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`client/src/App.tsx`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Defines SPA route tree, subroutes, and access protection wrappers (`DeveloperDocsRoute`).</td>
          </tr>
        </tbody>
      </table>

      {/* ── 15. ENGINEERING PRINCIPLES & CONVENTIONS ─────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>15. Engineering Principles &amp; Conventions</h2>
      <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 28 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Observed Repository Conventions</h3>
        <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <li style={{ marginBottom: 8 }}><strong>Controller / Service Separation:</strong> Controllers parse and validate requests; services execute database or provider interactions.</li>
          <li style={{ marginBottom: 8 }}><strong>Zod Payload Validation:</strong> All incoming REST payloads are validated via Zod schemas before reaching service handlers.</li>
          <li style={{ marginBottom: 8 }}><strong>Workspace Scoping:</strong> Multi-tenant isolation is enforced via `workspaceContext.js` middleware checking `WorkspaceMember` status.</li>
          <li style={{ marginBottom: 8 }}><strong>Idempotent Ledger Ledger Transactions:</strong> Wallet balance subtractions write a unique `idempotencyKey` inside Prisma `$transaction` blocks.</li>
        </ul>
      </div>

      {/* ── 16. KNOWN SYSTEM CONSTRAINTS ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>16. Known System Constraints</h2>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}><strong>Supabase Advisory Lock Limitation:</strong> Migrations must run with `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` because PgBouncer connection pooling does not support Postgres advisory locks.</li>
        <li style={{ marginBottom: 8 }}><strong>Plivo Indian Domestic Calling Constraint:</strong> Twilio cannot legally originate Indian domestic calls. Indian numbers route through Plivo sub-accounts.</li>
        <li style={{ marginBottom: 8 }}><strong>Single-Origin WebSocket Upgrade Constraint:</strong> WebCall WebSockets bind against `window.location.host`. Deployments must proxy WS upgrades on the same domain port as HTTP REST.</li>
      </ul>

      {/* ── 17. GLOSSARY ─────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>17. Technical Glossary</h2>
      <dl style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 28 }}>
        <dt style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 8 }}>Agent</dt>
        <dd style={{ marginLeft: 16, marginBottom: 8 }}>A configured AI voice persona with prompt instructions, temperature, voice ID, and speech engine choice.</dd>
        <dt style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 8 }}>Workspace</dt>
        <dd style={{ marginLeft: 16, marginBottom: 8 }}>A multi-tenant organization container isolating agents, phone numbers, call logs, wallets, and API keys.</dd>
        <dt style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 8 }}>Campaign</dt>
        <dd style={{ marginLeft: 16, marginBottom: 8 }}>An asynchronous batch outbound dialing run enqueued via BullMQ.</dd>
        <dt style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 8 }}>Voice Activity Detection (VAD)</dt>
        <dd style={{ marginLeft: 16, marginBottom: 8 }}>Module (`speechGate.js`) that measures audio signal RMS energy to detect when the caller speaks or pauses.</dd>
      </dl>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <span></span>
        <Link to="/docs/developer/architecture" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          2. Architecture →
        </Link>
      </div>
    </div>
  );
}
